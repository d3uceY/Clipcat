//go:build darwin

package platform

import "os/exec"

// focusRunningInstance brings the Clipcat that already owns the lock file to
// the front.
func focusRunningInstance() {
	exec.Command("osascript", "-e",
		`tell application "System Events" to set frontmost of process "Clipcat" to true`,
	).Run()
}
