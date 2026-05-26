package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
)

var encKey []byte
var encBlock cipher.Block // cached AES cipher – created once, reused forever

// InitEncryption loads (or generates on first run) the per-installation
// encryption key from the encryption_meta table.
// Must be called after InitDB, CreateTables, and MigrateEncryptionColumns.
func InitEncryption() error {
	key, err := getOrCreateEncryptionKey()
	if err != nil {
		return fmt.Errorf("encryption init: %w", err)
	}
	encKey = key
	block, err := aes.NewCipher(encKey)
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

func encryptData(plaintext []byte) ([]byte, error) {
	gcm, err := cipher.NewGCM(encBlock)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
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

func encryptText(plaintext string) (string, error) {
	ct, err := encryptData([]byte(plaintext))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(ct), nil
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

func hashContent(data []byte) string {
	mac := hmac.New(sha256.New, encKey)
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}
