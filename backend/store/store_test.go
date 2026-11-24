package store

import (
	"context"
	"errors"
	"testing"
)

// unavailableKeychain makes the OS keychain look absent, so every test takes
// the key-file fallback. Tests must never read or write the developer's real
// credentials.
type unavailableKeychain struct{}

func (unavailableKeychain) Get(string, string) (string, error) {
	return "", errors.New("no keychain in tests")
}

func (unavailableKeychain) Set(string, string, string) error {
	return errors.New("no keychain in tests")
}

// initTestStore opens a fresh in-memory database with a throwaway key.
func initTestStore(t *testing.T) {
	t.Helper()
	keyStore = unavailableKeychain{}
	if err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	t.Cleanup(func() {
		CloseIndex()
		CloseDB()
	})
	if err := RunMigrations(t.TempDir()); err != nil {
		t.Fatalf("RunMigrations: %v", err)
	}
}

// indexHasRow reports whether the in-memory search index still holds id.
func indexHasRow(t *testing.T, id int) bool {
	t.Helper()
	indexMu.Lock()
	defer indexMu.Unlock()
	if indexConn == nil {
		t.Fatal("search index is not open")
	}
	var n int
	if err := indexConn.QueryRowContext(context.Background(),
		`SELECT COUNT(*) FROM clips_fts WHERE rowid = ?`, id).Scan(&n); err != nil {
		t.Fatalf("index query: %v", err)
	}
	return n > 0
}
