package lib

import "runtime"

// GetPlatform returns the current operating system:
// "darwin", "linux", or "windows".
func GetPlatform() string {
	return runtime.GOOS
}
