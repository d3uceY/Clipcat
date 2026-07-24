//go:build linux

package clipboard

/*
#cgo LDFLAGS: -lX11 -lXfixes
#include <stdlib.h>

// Declarations from x11_hotkey_linux.c
extern int  initX11Hotkey(void);
extern void runX11EventLoop(void);

// Declarations from x11_clipboard_linux.c
extern int  initClipboardX11(void);
extern int  clipboardReadTargetWithTimeout(const char *target, unsigned char **buf, int timeout_ms);
extern int  initClipboardMonitorX11(void);
extern void runX11ClipboardMonitor(void);
*/
import "C"
import (
	"context"
	"fmt"
	"hash/fnv"
	"os"
	"os/exec"
	"strings"
	"time"
	"unsafe"
)

func shouldSkip() bool {
	if isPaused.Load() {
		return true
	}
	if isForegroundProcessIgnored() {
		return true
	}
	return false
}

func fireChange() {
	now := time.Now()
	clipboardMutex.Lock()
	if now.Sub(lastClipboardChange) > 150*time.Millisecond {
		lastClipboardChange = now
		clipboardMutex.Unlock()
		if onChangeCallback != nil {
			onChangeCallback()
		}
	} else {
		clipboardMutex.Unlock()
	}
}

//export linuxHotkeyFired
func linuxHotkeyFired() {
	capturePreviousAppLinux()
	if onHotkeyCallback != nil {
		go onHotkeyCallback()
	}
}

//export clipboardChangedFired
func clipboardChangedFired() {
	if shouldSkip() {
		return
	}
	fireChange()
}

// ── X11 data reading ──────────────────────────────────────────────────

func readClipboardTextX11(timeout time.Duration) string {
	cTarget := C.CString("UTF8_STRING")
	defer C.free(unsafe.Pointer(cTarget))

	var buf *C.uchar
	n := int(C.clipboardReadTargetWithTimeout(cTarget, &buf, C.int(timeout/time.Millisecond)))
	if n <= 0 {
		if buf != nil {
			C.free(unsafe.Pointer(buf))
		}
		return ""
	}
	defer C.free(unsafe.Pointer(buf))
	return string(C.GoBytes(unsafe.Pointer(buf), C.int(n)))
}

// ── Wayland data reading (via wl-paste CLI) ───────────────────────────

func readClipboardTextWl(timeout time.Duration) string {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "wl-paste", "--no-newline")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func readImageWl(timeout time.Duration) []byte {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "wl-paste", "--type", "image/png")
	out, err := cmd.Output()
	if err != nil || len(out) == 0 {
		return nil
	}
	return out
}

func isWayland() bool {
	return os.Getenv("WAYLAND_DISPLAY") != ""
}

// ── Exported ReadText / ReadImage (used by app.go) ────────────────────

func ReadText() string {
	if isWayland() {
		if text := readClipboardTextWl(5 * time.Second); text != "" {
			return text
		}
	}
	return readClipboardTextX11(5 * time.Second)
}

func ReadImage() []byte {
	if isWayland() {
		if img := readImageWl(5 * time.Second); img != nil {
			return img
		}
	}
	cTarget := C.CString("image/png")
	defer C.free(unsafe.Pointer(cTarget))
	var buf *C.uchar
	n := int(C.clipboardReadTargetWithTimeout(cTarget, &buf, C.int(5000)))
	if n <= 0 {
		if buf != nil {
			C.free(unsafe.Pointer(buf))
		}
		return nil
	}
	defer C.free(unsafe.Pointer(buf))
	return C.GoBytes(unsafe.Pointer(buf), C.int(n))
}

// ── Wayland: wl-paste polling loop ────────────────────────────────────

func startWaylandPoller() {
	fmt.Println("[clipboard] Wayland - wl-paste polling (1s interval)")

	pollInterval := 1 * time.Second
	readTimeout := 5 * time.Second
	var lastText string
	var lastImageCRC uint64

	for {
		time.Sleep(pollInterval)
		if shouldSkip() {
			continue
		}

		text := readClipboardTextWl(readTimeout)
		if text != lastText {
			lastText = text
			if text != "" {
				fireChange()
			}
		}

		img := readImageWl(readTimeout)
		if len(img) > 0 {
			h := fnv.New64a()
			h.Write(img)
			crc := h.Sum64()
			if crc != lastImageCRC {
				lastImageCRC = crc
				fireChange()
			}
		}
	}
}

// ── X11: XFixes event-driven monitor ──────────────────────────────────

// StartClipboardListener picks the best clipboard monitoring strategy:
//
//	X11      -> XFixesSelectSelectionInput (event-driven, zero polling)
//	Wayland  -> wl-paste polling (1s interval, 5s per-read timeout)
func StartClipboardListener(onChange func(), onHotkey func()) {
	onChangeCallback = onChange
	onHotkeyCallback = onHotkey

	// X11 hotkey (works on both X11 and XWayland).
	go func() {
		if C.initX11Hotkey() != 0 {
			return
		}
		C.runX11EventLoop()
	}()

	if isWayland() {
		// On Wayland, XFixes via XWayland only catches XWayland-native
		// clipboard changes - not Wayland-native copies (e.g. Firefox).
		C.initClipboardX11() // for ReadText/ReadImage fallback
		go startWaylandPoller()
		return
	}

	// X11: XFixes event-driven
	if C.initClipboardX11() != 0 {
		fmt.Println("[clipboard] X11 not available")
		return
	}
	if C.initClipboardMonitorX11() != 0 {
		fmt.Println("[clipboard] XFixes not available")
		return
	}
	go C.runX11ClipboardMonitor()
}

// ── Foreground app detection (for ignore list) ────────────────────────

func getForegroundAppNameLinux() string {
	pidOut, err := exec.Command("xdotool", "getactivewindow", "getwindowpid").Output()
	if err != nil {
		return ""
	}
	pid := strings.TrimSpace(string(pidOut))
	if pid == "" {
		return ""
	}
	commOut, err := exec.Command("cat", "/proc/"+pid+"/comm").Output()
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(string(commOut)))
}
