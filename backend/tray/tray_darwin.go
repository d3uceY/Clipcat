//go:build darwin

package tray

/*
#cgo LDFLAGS: -framework Cocoa

#include <dispatch/dispatch.h>
#include <stdlib.h>

// Functions implemented in tray_darwin.m
extern void createTraySync(const void *iconBytes, int iconLen);
extern void activateApp(void);
extern void stopTray(void);
*/
import "C"
import "unsafe"

var (
	darwinOnShow func()
	darwinOnQuit func()
)

// Start creates a macOS menu bar icon.
func Start(iconBytes []byte, onShow func(), onQuit func()) {
	darwinOnShow = onShow
	darwinOnQuit = onQuit

	if len(iconBytes) > 0 {
		C.createTraySync(unsafe.Pointer(&iconBytes[0]), C.int(len(iconBytes)))
	} else {
		C.createTraySync(nil, 0)
	}
}

// Activate brings the app to the foreground so a hidden accessory window can be shown.
func Activate() {
	C.activateApp()
}

// Stop removes the menu bar icon.
func Stop() {
	C.stopTray()
}

//export darwinTrayOnShow
func darwinTrayOnShow() {
	if darwinOnShow != nil {
		darwinOnShow()
	}
}

//export darwinTrayOnQuit
func darwinTrayOnQuit() {
	if darwinOnQuit != nil {
		darwinOnQuit()
	}
}
