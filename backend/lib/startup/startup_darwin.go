//go:build darwin

package startup

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const launchAgentPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.clipcat.app</string>
	<key>Program</key>
	<string>%s</string>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<false/>
</dict>
</plist>`

func launchAgentPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", "com.clipcat.app.plist")
}

func RemoveStartupWindows() error {
	path := launchAgentPath()
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	// Unload the agent if it was loaded
	exec.Command("launchctl", "unload", path).Run()
	return nil
}

func IsStartupEnabledWindows() (bool, error) {
	_, err := os.Stat(launchAgentPath())
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

	path := launchAgentPath()
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	plistContent := fmt.Sprintf(launchAgentPlist, exePath)
	if err := os.WriteFile(path, []byte(plistContent), 0644); err != nil {
		return err
	}

	// Load the LaunchAgent
	return exec.Command("launchctl", "load", path).Run()
}
