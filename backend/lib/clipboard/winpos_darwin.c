#include <ApplicationServices/ApplicationServices.h>

void clipcat_cursor_pos(int *outX, int *outY) {
	CGEventRef ev = CGEventCreate(NULL);
	CGPoint    pt = CGEventGetLocation(ev);
	CFRelease(ev);
	*outX = (int)pt.x;
	*outY = (int)pt.y;
}

void clipcat_monitor_bounds_at(int px, int py,
                               int *mx, int *my,
                               int *mw, int *mh) {
	CGPoint           pt    = {(CGFloat)px, (CGFloat)py};
	CGDirectDisplayID disp  = CGMainDisplayID();
	uint32_t          count = 0;
	CGGetDisplaysWithPoint(pt, 1, &disp, &count);
	CGRect b = CGDisplayBounds(disp);
	*mx = (int)b.origin.x;
	*my = (int)b.origin.y;
	*mw = (int)b.size.width;
	*mh = (int)b.size.height;
}
