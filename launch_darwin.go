//go:build darwin

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func prepareDarwinBundleLaunch() bool {
	exePath, err := os.Executable()
	if err != nil {
		return true
	}

	const bundleMarker = ".app/Contents/MacOS/"
	idx := strings.Index(exePath, bundleMarker)
	if idx == -1 {
		return true
	}

	if !isLikelyTerminalLaunch() {
		return true
	}

	bundlePath := exePath[:idx+4]
	if _, err := os.Stat(bundlePath); err != nil {
		return true
	}

	if err := exec.Command("open", "-n", bundlePath).Start(); err != nil {
		return true
	}

	return false
}

func isLikelyTerminalLaunch() bool {
	parentName := strings.ToLower(filepath.Base(parentProcessName()))
	switch parentName {
	case "zsh", "bash", "sh", "fish", "tmux", "screen":
		return true
	}
	return false
}

func parentProcessName() string {
	ppid := os.Getppid()
	if ppid <= 1 {
		return ""
	}

	out, err := exec.Command("ps", "-p", strconv.Itoa(ppid), "-o", "comm=").Output()
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(out))
}