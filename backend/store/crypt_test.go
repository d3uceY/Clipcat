package store

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSealRoundTrip(t *testing.T) {
	initTestStore(t)

	sealed, err := sealValue("the quick brown fox", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue: %v", err)
	}
	if strings.Contains(sealed, "quick") {
		t.Fatalf("sealed value contains plaintext: %q", sealed)
	}

	plain, err := openValue(sealed, aadClipContent)
	if err != nil {
		t.Fatalf("openValue: %v", err)
	}
	if plain != "the quick brown fox" {
		t.Fatalf("round trip = %q", plain)
	}

	// Every seal uses a fresh nonce.
	again, err := sealValue("the quick brown fox", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue: %v", err)
	}
	if again == sealed {
		t.Fatal("two seals of the same value produced identical ciphertext")
	}
}

func TestOpenRejectsTamperedCiphertext(t *testing.T) {
	initTestStore(t)

	sealed, err := sealValue("tamper me", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue: %v", err)
	}
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	raw[len(raw)-1] ^= 0xff
	if _, err := openValue(base64.StdEncoding.EncodeToString(raw), aadClipContent); err == nil {
		t.Fatal("tampered ciphertext was accepted")
	}
}

func TestOpenRejectsWrongAAD(t *testing.T) {
	initTestStore(t)

	sealed, err := sealValue("column bound", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue: %v", err)
	}
	if _, err := openValue(sealed, "clipcat/clips/other/v1"); err == nil {
		t.Fatal("ciphertext opened under the wrong AAD")
	}
}

func TestOpenRejectsWrongKey(t *testing.T) {
	initTestStore(t)

	sealed, err := sealValue("not for you", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue: %v", err)
	}

	previous := contentAEAD
	t.Cleanup(func() { contentAEAD = previous })
	other, err := newMasterKey()
	if err != nil {
		t.Fatalf("newMasterKey: %v", err)
	}
	if err := other.apply(); err != nil {
		t.Fatalf("apply: %v", err)
	}
	if _, err := openValue(sealed, aadClipContent); err == nil {
		t.Fatal("ciphertext opened under a different key")
	}
}

// TestInitStorageKeyFallsBackToFile covers a desktop with no Secret Service:
// the key must still be persisted, and the backend must be recorded so later
// launches read the same place.
func TestInitStorageKeyFallsBackToFile(t *testing.T) {
	initTestStore(t)

	var (
		keyID   string
		backend string
	)
	if err := DB.QueryRow(`SELECT key_id, key_backend FROM storage_meta WHERE id = 0`).
		Scan(&keyID, &backend); err != nil {
		t.Fatalf("read storage_meta: %v", err)
	}
	if keyID == "" {
		t.Fatal("storage_meta has no key id")
	}
	if backend != backendFile {
		t.Fatalf("backend = %q, want %q", backend, backendFile)
	}
}

// TestInitStorageKeyRefusesMissingKey covers a deleted keychain entry: the
// database names a key that cannot be found, so startup must fail rather than
// mint a new key and strand every clip.
func TestInitStorageKeyRefusesMissingKey(t *testing.T) {
	initTestStore(t)

	if _, err := DB.Exec(`UPDATE storage_meta SET key_id = 'deadbeefdeadbeef' WHERE id = 0`); err != nil {
		t.Fatalf("update storage_meta: %v", err)
	}
	err := InitStorageKey(t.TempDir())
	if err == nil {
		t.Fatal("InitStorageKey generated a key for a database that already has one")
	}
	if !strings.Contains(err.Error(), "deadbeefdeadbeef") {
		t.Fatalf("error does not name the missing key: %v", err)
	}

	// The failure must not disturb the live key.
	sealed, err := sealValue("still readable", aadClipContent)
	if err != nil {
		t.Fatalf("sealValue after failure: %v", err)
	}
	if plain, err := openValue(sealed, aadClipContent); err != nil || plain != "still readable" {
		t.Fatalf("key was clobbered by failed init: %q %v", plain, err)
	}
}

// TestMigrateEncryptsLegacyPlaintext starts from a database written by the
// previous version - plaintext clips plus the on-disk FTS mirror - and checks
// that startup seals the rows, removes the plaintext tables, and leaves the
// file with no readable copy of the clip.
func TestMigrateEncryptsLegacyPlaintext(t *testing.T) {
	const canary = "migration-canary-9f3a"

	dir := t.TempDir()
	path := filepath.Join(dir, "legacy.db")

	raw, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	_, err = raw.Exec(`
		CREATE TABLE clips (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			content TEXT,
			image BLOB,
			type TEXT NOT NULL,
			pinned BOOLEAN DEFAULT 0,
			created_at DATETIME,
			encrypted INTEGER DEFAULT 0,
			content_hash TEXT,
			thumbnail BLOB
		);
		INSERT INTO clips (content, type, pinned, created_at)
			VALUES ('migration-canary-9f3a', 'text', 0, datetime('now'));
		CREATE VIRTUAL TABLE clips_fts USING fts5(content, tokenize = 'unicode61');
		INSERT INTO clips_fts (rowid, content) VALUES (1, 'migration-canary-9f3a');
		CREATE TABLE encryption_meta (id INTEGER PRIMARY KEY CHECK (id = 0), machine_key TEXT NOT NULL);
		INSERT INTO encryption_meta (id, machine_key) VALUES (0, 'legacy-machine-key');
	`)
	if err != nil {
		raw.Close()
		t.Fatalf("build legacy db: %v", err)
	}
	if err := raw.Close(); err != nil {
		t.Fatalf("close legacy db: %v", err)
	}

	keyStore = unavailableKeychain{}
	if err := InitDB(path); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() {
		CloseIndex()
		CloseDB()
	})
	if err := RunMigrations(dir); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}

	var (
		stored     string
		encVersion int
	)
	if err := DB.QueryRow(`SELECT content, enc_version FROM clips WHERE id = 1`).
		Scan(&stored, &encVersion); err != nil {
		t.Fatalf("read migrated row: %v", err)
	}
	if encVersion != 1 {
		t.Fatalf("enc_version = %d, want 1", encVersion)
	}
	if strings.Contains(stored, canary) {
		t.Fatalf("migrated row still holds plaintext: %q", stored)
	}
	if plain, err := openValue(stored, aadClipContent); err != nil || plain != canary {
		t.Fatalf("migrated row does not decrypt: %q %v", plain, err)
	}

	var legacyObjects int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'clips_fts%' OR name = 'encryption_meta'`).
		Scan(&legacyObjects); err != nil {
		t.Fatalf("count legacy objects: %v", err)
	}
	if legacyObjects != 0 {
		t.Errorf("%d legacy plaintext objects still exist", legacyObjects)
	}
	if columnExists("clips", "encrypted") {
		t.Error("the dead encrypted flag is still on the clips table")
	}

	// The rebuild that runs right after the migration must index the sealed row.
	got, err := SearchClips("canary")
	if err != nil {
		t.Fatalf("SearchClips: %v", err)
	}
	if len(got) != 1 || got[0].Content == nil || *got[0].Content != canary {
		t.Fatalf("search did not find the migrated clip: %+v", got)
	}

	// Nothing plaintext survives in the file itself.
	CloseIndex()
	CloseDB()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read db file: %v", err)
	}
	if strings.Contains(string(data), canary) {
		t.Error("the clip text is still readable in the database file")
	}
	if strings.Contains(string(data), "legacy-machine-key") {
		t.Error("the old in-database key survived the migration")
	}
}
