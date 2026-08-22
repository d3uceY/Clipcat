package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
)

// At-rest encryption has been removed. This file only keeps the legacy AES
// decrypt helpers (used by MigrateDecryptClips to convert rows written by an
// older version) plus the keyless content hash used for duplicate detection.

var encBlock cipher.Block // cached AES cipher from the legacy machine key

// InitEncryption loads the per-installation encryption key left behind by an
// older version so MigrateDecryptClips can decrypt legacy rows on startup.
func InitEncryption() error {
	key, err := getOrCreateEncryptionKey()
	if err != nil {
		return fmt.Errorf("encryption init: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("encryption init cipher: %w", err)
	}
	encBlock = block
	return nil
}

func getOrCreateEncryptionKey() ([]byte, error) {
	var encoded string
	err := DB.QueryRow(`SELECT machine_key FROM encryption_meta WHERE id = 0`).Scan(&encoded)
	if err == nil {
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("decode stored key: %w", err)
		}
		if len(key) != 32 {
			return nil, fmt.Errorf("stored key has unexpected length %d", len(key))
		}
		return key, nil
	}

	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}
	encoded = base64.StdEncoding.EncodeToString(key)
	if _, err := DB.Exec(`INSERT INTO encryption_meta (id, machine_key) VALUES (0, ?)`, encoded); err != nil {
		return nil, fmt.Errorf("store key: %w", err)
	}
	return key, nil
}

func decryptData(data []byte) ([]byte, error) {
	gcm, err := cipher.NewGCM(encBlock)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	return gcm.Open(nil, data[:nonceSize], data[nonceSize:], nil)
}

func decryptText(encoded string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	pt, err := decryptData(data)
	if err != nil {
		return "", err
	}
	return string(pt), nil
}

// hashContent returns a plain SHA-256 of data, used for duplicate detection.
func hashContent(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
