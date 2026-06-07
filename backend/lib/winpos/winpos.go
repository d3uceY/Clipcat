// Package winpos provides utilities for positioning a window near the cursor
// while keeping it fully within the bounds of the monitor it appears on.
package winpos

// Point is a 2-D position in screen coordinates.
type Point struct{ X, Y int }

// Size holds the width and height of a window in logical pixels.
type Size struct{ W, H int }

// Rect describes a monitor region: top-left corner (X, Y) and dimensions.
type Rect struct{ X, Y, W, H int }

// offset is the gap in pixels between the cursor and the window edge.
const offset = 16

// CalcWindowPos returns the top-left position for a window of size win so
// that it appears close to cursor while staying fully inside screen.
//
//   - The window is placed below-right of the cursor by default.
//   - If the right edge would clip, it is flipped to the left of the cursor.
//   - If the bottom edge would clip, it is flipped above the cursor.
//   - A final clamp ensures the window never escapes the screen bounds.
func CalcWindowPos(cursor Point, win Size, screen Rect) Point {
	x := cursor.X + offset
	y := cursor.Y + offset

	// Flip horizontally when right edge goes off screen.
	if x+win.W > screen.X+screen.W {
		x = cursor.X - win.W - offset
	}

	// Flip vertically when bottom edge goes off screen.
	if y+win.H > screen.Y+screen.H {
		y = cursor.Y - win.H - offset
	}

	// Clamp to keep the window fully on-screen even after flipping.
	if x < screen.X {
		x = screen.X
	}
	if y < screen.Y {
		y = screen.Y
	}
	if x+win.W > screen.X+screen.W {
		x = screen.X + screen.W - win.W
	}
	if y+win.H > screen.Y+screen.H {
		y = screen.Y + screen.H - win.H
	}

	return Point{X: x, Y: y}
}
