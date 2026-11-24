package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

// At-rest storage key. Clip text is sealed with AES-256-GCM under a random
// master key that lives in the OS keychain, never in the database file.
//
// The database only records the key's id (storage_meta.key_id) so a replaced or
// deleted key is detected instead of silently producing garbage.

const (
	keyringService = "Clipcat"
	keyringAccount = "database-key"
	keyFileName    = "storage.key"

	masterKeyBytes = 32

	backendKeyring = "keyring"
	backendFile    = "file"

	// aadClipContent binds a sealed value to the column it was written for, so
	// a ciphertext cannot be swapped between columns.
	aadClipContent = "clipcat/clips/content/v1"
)

// keychain is the OS secret store. Tests replace it so they never touch the
// developer's real credentials.
type keychain interface {
	Get(service, user string) (string, error)
	Set(service, user, secret string) error
}

type osKeychain struct{}

func (osKeychain) Get(service, user string) (string, error) {
	return keyring.Get(service, user)
}

func (osKeychain) Set(service, user, secret string) error {
	return keyring.Set(service, user, secret)
}

var keyStore keychain = osKeychain{}

var (
	errKeyNotFound  = errors.New("storage key not found")
	errNoStorageKey = errors.New("storage key not initialized")
)

// masterKey is the secret every other key derives from.
type masterKey struct {
	id  string // random hex id, recorded in the database
	raw []byte // 32 random bytes
}

// storageMeta is the single row of storage_meta.
type storageMeta struct {
	keyID      string
	keyBackend string
}

// contentAEAD and hashKey are derived from the master key by apply.
var (
	contentAEAD cipher.AEAD
	hashKey     []byte
)

func newMasterKey() (*masterKey, error) {
	raw := make([]byte, masterKeyBytes)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return nil, fmt.Errorf("generate storage key: %w", err)
	}
	id := make([]byte, 8)
	if _, err := io.ReadFull(rand.Reader, id); err != nil {
		return nil, fmt.Errorf("generate storage key id: %w", err)
	}
	return &masterKey{id: hex.EncodeToString(id), raw: raw}, nil
}

// String encodes the key for the keychain or key file: "v1.<id>.<base64>".
func (k masterKey) String() string {
	return "v1." + k.id + "." + base64.StdEncoding.EncodeToString(k.raw)
}

func parseMasterKey(s string) (*masterKey, error) {
	parts := strings.Split(strings.TrimSpace(s), ".")
	if len(parts) != 3 || parts[0] != "v1" || parts[1] == "" {
		return nil, fmt.Errorf("malformed storage key")
	}
	raw, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return nil, fmt.Errorf("decode storage key: %w", err)
	}
	if len(raw) != masterKeyBytes {
		return nil, fmt.Errorf("storage key has unexpected length %d", len(raw))
	}
	return &masterKey{id: parts[1], raw: raw}, nil
}

func (k *masterKey) apply() error {
	contentKey, err := hkdf.Key(sha256.New, k.raw, nil, "clipcat clip content v1", 32)
	if err != nil {
		return fmt.Errorf("derive content key: %w", err)
	}
	derivedHashKey, err := hkdf.Key(sha256.New, k.raw, nil, "clipcat clip hash v1", 32)
	if err != nil {
		return fmt.Errorf("derive hash key: %w", err)
	}
	block, err := aes.NewCipher(contentKey)
	if err != nil {
		return fmt.Errorf("cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("gcm: %w", err)
	}
	contentAEAD = aead
	hashKey = derivedHashKey
	return nil
}

func loadStorageMeta() (storageMeta, error) {
	var m storageMeta
	err := DB.QueryRow(`SELECT key_id, key_backend FROM storage_meta WHERE id = 0`).
		Scan(&m.keyID, &m.keyBackend)
	if errors.Is(err, sql.ErrNoRows) {
		return m, nil
	}
	if err != nil {
		return m, fmt.Errorf("read storage_meta: %w", err)
	}
	return m, nil
}

func saveStorageKeyMeta(keyID, backend string) error {
	result, err := DB.Exec(
		`UPDATE storage_meta SET key_id = ?, key_backend = ?, enc_version = 1 WHERE id = 0`,
		keyID, backend,
	)
	if err != nil {
		return fmt.Errorf("save storage key metadata: %w", err)
	}
	if n, _ := result.RowsAffected(); n == 0 {
		_, err = DB.Exec(
			`INSERT INTO storage_meta (id, key_id, key_backend, enc_version) VALUES (0, ?, ?, 1)`,
			keyID, backend,
		)
		if err != nil {
			return fmt.Errorf("insert storage key metadata: %w", err)
		}
	}
	return nil
}

// readKeyFrom loads the master key from one backend. A missing key reports
// errKeyNotFound; an unusable backend reports the underlying error.
func readKeyFrom(backend, dir string) (*masterKey, error) {
	var (
		encoded string
		err     error
	)
	switch backend {
	case backendKeyring:
		encoded, err = keyStore.Get(keyringService, keyringAccount)
		if errors.Is(err, keyring.ErrNotFound) {
			return nil, errKeyNotFound
		}
		if err != nil {
			return nil, fmt.Errorf("keychain: %w", err)
		}
	case backendFile:
		path := filepath.Join(dir, keyFileName)
		data, readErr := os.ReadFile(path)
		if errors.Is(readErr, os.ErrNotExist) {
			return nil, errKeyNotFound
		}
		if readErr != nil {
			return nil, fmt.Errorf("key file: %w", readErr)
		}
		if info, statErr := os.Stat(path); statErr == nil && info.Mode().Perm()&0o077 != 0 {
			fmt.Printf("storage: %s is readable by other users (mode %o)\n", path, info.Mode().Perm())
		}
		encoded = string(data)
	default:
		return nil, fmt.Errorf("unknown key backend %q", backend)
	}
	return parseMasterKey(encoded)
}

// writeKey stores a new master key, preferring the keychain. It reports which
// backend holds the key so storage_meta can record it and later runs read the
// same place.
func writeKey(k *masterKey, dir string) (string, error) {
	encoded := k.String()

	keychainErr := keyStore.Set(keyringService, keyringAccount, encoded)
	if keychainErr == nil {
		// Record the keychain only if the key can actually be read back. An
		// entry that was written but cannot be retrieved later would leave the
		// database unreadable on the next launch.
		if got, err := keyStore.Get(keyringService, keyringAccount); err == nil && got == encoded {
			return backendKeyring, nil
		}
		keychainErr = errors.New("key could not be read back")
	}

	if err := writeKeyFile(dir, encoded); err != nil {
		return "", fmt.Errorf("cannot store storage key (keychain: %v; key file: %w)", keychainErr, err)
	}
	return backendFile, nil
}

// writeKeyFile persists the key with owner-only permissions and flushes it, so
// a crash cannot leave a truncated key behind a database sealed with it.
func writeKeyFile(dir, encoded string) error {
	f, err := os.OpenFile(filepath.Join(dir, keyFileName), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.WriteString(encoded + "\n"); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// InitStorageKey loads the master key, creating it on first run. It refuses to
// create a key when the database already names one: that would strand every
// encrypted clip behind a key nobody has.
func InitStorageKey(dir string) error {
	meta, err := loadStorageMeta()
	if err != nil {
		return err
	}

	// Read the backend the database was created with first, so a leftover
	// entry in the other backend cannot shadow the real key.
	order := []string{backendKeyring, backendFile}
	if meta.keyBackend == backendFile {
		order = []string{backendFile, backendKeyring}
	}

	type candidate struct {
		key     *masterKey
		backend string
	}
	var (
		candidates []candidate
		notes      []string
	)
	for _, backend := range order {
		k, err := readKeyFrom(backend, dir)
		switch {
		case err == nil:
			candidates = append(candidates, candidate{k, backend})
		case errors.Is(err, errKeyNotFound):
		default:
			notes = append(notes, fmt.Sprintf("%s: %v", backend, err))
		}
	}

	var found candidate
	for _, c := range candidates {
		if c.key.id == meta.keyID {
			found = c
			break
		}
	}
	if found.key == nil {
		if meta.keyID != "" {
			return fmt.Errorf(
				"storage key %s is unavailable: the database is encrypted with it, so a new key cannot be generated (%s)",
				meta.keyID, strings.Join(append(notes, "no matching key found"), "; "),
			)
		}
		if len(candidates) > 0 {
			// Database without a recorded key (pre-encryption install): reuse
			// the existing key rather than churning it.
			found = candidates[0]
		}
	}

	if found.key == nil {
		k, err := newMasterKey()
		if err != nil {
			return err
		}
		backend, err := writeKey(k, dir)
		if err != nil {
			return err
		}
		found = candidate{k, backend}
		fmt.Printf("storage: created master key in %s\n", backend)
	}

	if err := found.key.apply(); err != nil {
		return err
	}
	if found.key.id != meta.keyID || found.backend != meta.keyBackend {
		if err := saveStorageKeyMeta(found.key.id, found.backend); err != nil {
			return err
		}
	}
	return nil
}

// aead returns the content cipher, failing loudly if the key was never loaded.
func aead() (cipher.AEAD, error) {
	if contentAEAD == nil {
		return nil, errNoStorageKey
	}
	return contentAEAD, nil
}

// sealValue encrypts plain and returns base64(nonce || ciphertext).
func sealValue(plain, aad string) (string, error) {
	gcm, err := aead()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("seal: %w", err)
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plain), []byte(aad))
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// openValue decrypts a value produced by sealValue.
func openValue(sealed, aad string) (string, error) {
	gcm, err := aead()
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil {
		return "", fmt.Errorf("decode sealed value: %w", err)
	}
	if len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("sealed value is truncated")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], []byte(aad))
	if err != nil {
		return "", fmt.Errorf("open sealed value: %w", err)
	}
	return string(plain), nil
}

// decodeClipText returns a clips.content value as plaintext. enc_version 0 rows
// predate at-rest encryption and are stored as-is; the migration rewrites them.
func decodeClipText(content string, encVersion int) (string, error) {
	if encVersion == 0 {
		return content, nil
	}
	return openValue(content, aadClipContent)
}

// hmacContent is the content_hash for text clips. A keyed digest keeps
// duplicate detection working without leaving a plain SHA-256 of every clip in
// the file (which would be an offline "does this contain X" oracle).
func hmacContent(content string) string {
	mac := hmac.New(sha256.New, hashKey)
	mac.Write([]byte(content))
	return hex.EncodeToString(mac.Sum(nil))
}

// sha256Hex hashes image bytes. Images are stored unencrypted, so their
// duplicate key is a plain digest.
func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
