#include <Carbon/Carbon.h>
#include <CoreGraphics/CoreGraphics.h>

// ── Hotkey ──────────────────────────────────────────────────────────────────

static EventHotKeyRef gHotKeyRef = NULL;

static OSStatus hotkeyHandler(EventHandlerCallRef nextHandler, EventRef event, void *userData) {
	extern void darwinHotkeyFired(void);
	darwinHotkeyFired();
	return noErr;
}

void registerDarwinHotkey(void) {
	EventTypeSpec eventType;
	eventType.eventClass = kEventClassKeyboard;
	eventType.eventKind = kEventHotKeyPressed;
	InstallApplicationEventHandler(NewEventHandlerUPP(hotkeyHandler), 1, &eventType, NULL, NULL);

	EventHotKeyID hotKeyID;
	hotKeyID.signature = 'CLIP';
	hotKeyID.id = 1;
	// kVK_ANSI_V = 9, Ctrl+Shift
	RegisterEventHotKey(9, controlKey | shiftKey, hotKeyID, GetApplicationEventTarget(), 0, &gHotKeyRef);
}

void unregisterDarwinHotkey(void) {
	if (gHotKeyRef != NULL) {
		UnregisterEventHotKey(gHotKeyRef);
		gHotKeyRef = NULL;
	}
}

// ── Paste via CGEvents ──────────────────────────────────────────────────────

// sendPasteDarwin fires Cmd+V into the frontmost app.
// Requires Accessibility permission (System Settings → Privacy → Accessibility).
// Uses kCGSessionEventTap — the standard way for assistive applications.
void sendPasteDarwin(void) {
	usleep(80000); // 80 ms — let the target app come to front

	CGEventSourceRef src = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
	if (!src) return;

	// Cmd down
	CGEventRef cmdDown = CGEventCreateKeyboardEvent(src, (CGKeyCode)55, true);
	CGEventSetFlags(cmdDown, kCGEventFlagMaskCommand);
	CGEventPost(kCGSessionEventTap, cmdDown);
	CFRelease(cmdDown);

	// V down
	CGEventRef vDown = CGEventCreateKeyboardEvent(src, (CGKeyCode)9, true);
	CGEventSetFlags(vDown, kCGEventFlagMaskCommand);
	CGEventPost(kCGSessionEventTap, vDown);
	CFRelease(vDown);

	// V up
	CGEventRef vUp = CGEventCreateKeyboardEvent(src, (CGKeyCode)9, false);
	CGEventPost(kCGSessionEventTap, vUp);
	CFRelease(vUp);

	// Cmd up
	CGEventRef cmdUp = CGEventCreateKeyboardEvent(src, (CGKeyCode)55, false);
	CGEventPost(kCGSessionEventTap, cmdUp);
	CFRelease(cmdUp);

	CFRelease(src);
}
