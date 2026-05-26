#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

extern void darwinTrayOnShow(void);
extern void darwinTrayOnQuit(void);
void activateApp(void);

@interface ClipcatTrayController : NSObject
@end
@implementation ClipcatTrayController
- (void)showAction:(id)sender  { activateApp(); darwinTrayOnShow(); }
- (void)quitAction:(id)sender  { darwinTrayOnQuit(); }
@end

static char kCtrlKey;
static NSStatusItem *gStatusItem = nil;
static NSImage *gPendingIcon = nil;
static id gLaunchObserver = nil;

static void configureButtonAppearance(NSStatusBarButton *btn, NSImage *icon) {
	btn.toolTip = @"Clipcat";
	btn.title = @"";

	NSImage *statusIcon = nil;
	if (@available(macOS 11.0, *)) {
		statusIcon = [NSImage imageWithSystemSymbolName:@"clipboard"
			accessibilityDescription:@"Clipcat"];
		if (statusIcon != nil) {
			[statusIcon setTemplate:YES];
			NSLog(@"[Clipcat] tray: using system symbol");
		}
	}

	if (statusIcon == nil && icon != nil) {
		statusIcon = icon;
		[statusIcon setTemplate:YES];
		NSLog(@"[Clipcat] tray: using bundled icon bytes as template");
	}

	if (statusIcon != nil) {
		[statusIcon setSize:NSMakeSize(16, 16)];
		btn.image = statusIcon;
		btn.imageScaling = NSImageScaleProportionallyDown;
		btn.imagePosition = NSImageOnly;
		return;
	}

	btn.image = nil;
	btn.title = @"C";
	btn.imagePosition = NSNoImage;
	NSLog(@"[Clipcat] tray: symbol and icon unavailable, text fallback");
}

static void doCreate(NSImage *icon) {
	gStatusItem = [[NSStatusBar systemStatusBar]
		statusItemWithLength:NSSquareStatusItemLength];
	if (@available(macOS 10.12, *)) {
		[gStatusItem setAutosaveName:@"com.clipcat.statusitem"];
		[gStatusItem setVisible:YES];
	}

	NSStatusBarButton *btn = gStatusItem.button;
	if (!btn) { NSLog(@"[Clipcat] tray: button nil"); return; }
	configureButtonAppearance(btn, icon);

	NSMenu *menu = [[NSMenu alloc] initWithTitle:@""];
	[menu setAutoenablesItems:NO];
	ClipcatTrayController *ctrl = [[ClipcatTrayController alloc] init];

	NSMenuItem *show = [[NSMenuItem alloc] initWithTitle:@"Show Clipcat"
		action:@selector(showAction:) keyEquivalent:@""];
	[show setTarget:ctrl]; [menu addItem:show];
	[menu addItem:[NSMenuItem separatorItem]];

	NSMenuItem *quit = [[NSMenuItem alloc] initWithTitle:@"Quit Clipcat"
		action:@selector(quitAction:) keyEquivalent:@""];
	[quit setTarget:ctrl]; [menu addItem:quit];

	gStatusItem.menu = menu;
	objc_setAssociatedObject(gStatusItem, &kCtrlKey,
		(__bridge id)(void *)CFBridgingRetain(ctrl),
		OBJC_ASSOCIATION_RETAIN_NONATOMIC);
	NSLog(@"[Clipcat] tray: created with menu");
}

static void createTrayWhenReady(void) {
	if (gStatusItem != nil) {
		return;
	}
	doCreate(gPendingIcon);
	if (gLaunchObserver != nil) {
		[[NSNotificationCenter defaultCenter] removeObserver:gLaunchObserver];
		gLaunchObserver = nil;
	}
}

void createTraySync(const void *iconBytes, int iconLen) {
	gPendingIcon = nil;
	if (iconBytes != nil && iconLen > 0) {
		NSData *buffer = [NSData dataWithBytes:iconBytes length:iconLen];
		gPendingIcon = [[NSImage alloc] initWithData:buffer];
	}

	dispatch_async(dispatch_get_main_queue(), ^{
		if (gLaunchObserver != nil) {
			return;
		}

		NSLog(@"[Clipcat] tray: waiting for NSApplicationDidBecomeActive");
		gLaunchObserver = [[NSNotificationCenter defaultCenter]
			addObserverForName:NSApplicationDidBecomeActiveNotification
			object:nil
			queue:[NSOperationQueue mainQueue]
			usingBlock:^(__unused NSNotification *note) {
				NSLog(@"[Clipcat] tray: app became active");
				createTrayWhenReady();
			}];

		dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)),
			dispatch_get_main_queue(), ^{
				if (gStatusItem == nil) {
					NSLog(@"[Clipcat] tray: activation fallback");
					createTrayWhenReady();
				}
			});
	});
}

void activateApp(void) {
	dispatch_async(dispatch_get_main_queue(), ^{
		[NSApp activateIgnoringOtherApps:YES];
	});
}

void stopTray(void) {
	if (gStatusItem) {
		[[NSStatusBar systemStatusBar] removeStatusItem:gStatusItem];
		gStatusItem = nil;
	}
}
