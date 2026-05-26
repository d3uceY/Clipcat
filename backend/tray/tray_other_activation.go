//go:build !darwin

package tray

// Activate is a no-op on platforms that don't need native app activation.
func Activate() {}