//go:build windows

package startup

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func getShortcutPath() (string, error) {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		return "", errors.New("APPDATA environment variable not set")
	}

	startup := filepath.Join(
		appData,
		"Microsoft", "Windows", "Start Menu", "Programs", "Startup",
	)

	shortcut := filepath.Join(startup, "Clipcat.lnk")
	return shortcut, nil
}

func RemoveStartupWindows() error {
	shortcut, err := getShortcutPath()
	if err != nil {
		return err
	}

	err = os.Remove(shortcut)
	if err != nil && !os.IsNotExist(err) {
		return err
	}

	return nil
}

func IsStartupEnabledWindows() (bool, error) {
	shortcut, err := getShortcutPath()
	if err != nil {
		return false, err
	}
	_, err = os.Stat(shortcut)
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

	shortcut, err := getShortcutPath()
	if err != nil {
		return err
	}

	ps := fmt.Sprintf(`
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("%s")
$Shortcut.TargetPath = "%s"
$Shortcut.Save()
`, shortcut, exePath)

	cmd := exec.Command("powershell", "-NoProfile", "-Command", ps)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}
	return cmd.Run()
}
