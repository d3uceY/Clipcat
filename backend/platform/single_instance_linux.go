//go:build linux

package platform

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

const lockFileName = "clipcat.lock"

// EnsureSingleInstance returns true if this is the only running instance.
// Uses a PID-based lock file to reliably detect another running Clipcat.
func EnsureSingleInstance() bool {
	lockDir, err := lockDirPath()
	if err != nil {
		return true
	}

	if err := os.MkdirAll(lockDir, 0700); err != nil {
		return true
	}

	lockPath := filepath.Join(lockDir, lockFileName)
	myPID := os.Getpid()

	if existing, err := os.ReadFile(lockPath); err == nil {
		var existingPID int
		if _, scanErr := fmt.Sscanf(string(existing), "%d", &existingPID); scanErr == nil {
			if existingPID != myPID {
				proc, findErr := os.FindProcess(existingPID)
				if findErr == nil {
					if signalErr := proc.Signal(syscall.Signal(0)); signalErr == nil {
						// Another instance is alive.
						exec.Command("wmctrl", "-a", "Clipcat").Run()
						return false
					}
				}
				os.Remove(lockPath)
			}
		}
	}

	if err := os.WriteFile(lockPath, []byte(fmt.Sprintf("%d", myPID)), 0644); err != nil {
		return true
	}

	return true
}

func lockDirPath() (string, error) {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cacheDir, "clipcat"), nil
}
