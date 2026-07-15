package sync

import (
	"bytes"
	"testing"
)

func TestDeriveKey(t *testing.T) {
	key := DeriveKey("hunter2")
	if len(key) != 32 {
		t.Fatalf("expected 32-byte key, got %d", len(key))
	}

	// Same passphrase → same key (deterministic).
	key2 := DeriveKey("hunter2")
	if !bytes.Equal(key, key2) {
		t.Fatal("same passphrase should produce the same key")
	}

	// Different passphrase → different key.
	key3 := DeriveKey("correct-horse-battery-staple")
	if bytes.Equal(key, key3) {
		t.Fatal("different passphrase should produce a different key")
	}
}

func TestEncryptDecrypt(t *testing.T) {
	key := DeriveKey("test-passphrase")
	plaintext := []byte("Hello, LAN sync!")

	ciphertext, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	// Ciphertext should include nonce + auth tag, so it must be longer than plaintext.
	if len(ciphertext) <= len(plaintext) {
		t.Fatal("ciphertext should be longer than plaintext")
	}

	decrypted, err := Decrypt(ciphertext, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if !bytes.Equal(plaintext, decrypted) {
		t.Fatalf("roundtrip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestDecryptWrongKey(t *testing.T) {
	key1 := DeriveKey("correct-passphrase")
	key2 := DeriveKey("wrong-passphrase")

	ciphertext, err := Encrypt([]byte("secret data"), key1)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	_, err = Decrypt(ciphertext, key2)
	if err == nil {
		t.Fatal("expected error when decrypting with wrong key")
	}
}

func TestEncryptEmpty(t *testing.T) {
	key := DeriveKey("test")
	ciphertext, err := Encrypt([]byte{}, key)
	if err != nil {
		t.Fatalf("Encrypt empty failed: %v", err)
	}
	decrypted, err := Decrypt(ciphertext, key)
	if err != nil {
		t.Fatalf("Decrypt empty failed: %v", err)
	}
	if len(decrypted) != 0 {
		t.Fatal("empty roundtrip should return empty")
	}
}

func TestDecryptTruncated(t *testing.T) {
	key := DeriveKey("test")
	_, err := Decrypt([]byte("too short"), key)
	if err == nil {
		t.Fatal("expected error for truncated ciphertext")
	}
}
