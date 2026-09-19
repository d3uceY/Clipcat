//go:build linux

package platform

import "os/exec"

// focusRunningInstance brings the Clipcat that already owns the lock file to
// the front. wmctrl is best-effort - it is not installed everywhere.
func focusRunningInstance() {
	exec.Command("wmctrl", "-a", "Clipcat").Run()
}
