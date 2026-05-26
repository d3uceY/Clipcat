//go:build linux

package startup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const desktopFileContent = `[Desktop Entry]
Type=Application
Name=Clipcat
Comment=Clipboard manager
Exec=%s
X-GNOME-Autostart-enabled=true
Terminal=false
Categories=Utility;
`

func autostartDesktopPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "autostart", "clipcat.desktop")
}

func RemoveStartupWindows() error {
	path := autostartDesktopPath()
	return os.Remove(path)
}

func IsStartupEnabledWindows() (bool, error) {
	_, err := os.Stat(autostartDesktopPath())
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func EnableStartupWindows() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	path := autostartDesktopPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	content := fmt.Sprintf(desktopFileContent, exePath)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}

	// Try to update the desktop database (best-effort)
	exec.Command("update-desktop-database", filepath.Join(os.Getenv("HOME"), ".local", "share", "applications")).Run()

	return nil
}
