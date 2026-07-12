package sync

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

const (
	// Salt is a static salt used for PBKDF2 key derivation. Since the
	// passphrase is never transmitted over the network, a static salt is
	// acceptable — if the passphrase is compromised, the salt doesn't
	// matter.
	salt = "clipcat-lan-sync-v1"

	// keyIterations is the PBKDF2 iteration count (OWASP 2023 minimum for
	// non-critical systems).
	keyIterations = 100000

	// keyLength is the AES-256 key size in bytes.
	keyLength = 32
)

// DeriveKey derives a 32-byte AES-256 key from the given passphrase using
// PBKDF2 with SHA-256 and 100,000 iterations.
func DeriveKey(passphrase string) []byte {
	return pbkdf2.Key([]byte(passphrase), []byte(salt), keyIterations, keyLength, sha256.New)
}

// Encrypt encrypts plaintext with AES-256-GCM using the provided key.
// The returned ciphertext is nonce || ciphertext || auth tag.
func Encrypt(plaintext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("sync encrypt: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("sync encrypt gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("sync encrypt nonce: %w", err)
	}

	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

// Decrypt decrypts a ciphertext produced by Encrypt.  Returns an error if
// the key is wrong or the data has been tampered with (GCM authentication
// failure).
func Decrypt(ciphertext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("sync decrypt: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("sync decrypt gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("sync decrypt: ciphertext too short")
	}

	plaintext, err := gcm.Open(nil, ciphertext[:nonceSize], ciphertext[nonceSize:], nil)
	if err != nil {
		return nil, fmt.Errorf("sync decrypt: %w", err)
	}

	return plaintext, nil
}
