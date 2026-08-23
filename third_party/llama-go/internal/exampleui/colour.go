// Package exampleui provides terminal UI utilities for llama-go examples.
//
// This package contains formatting, colour, and display utilities used by example
// programs. It is intentionally kept internal to avoid polluting the main library
// API whilst providing shared functionality across examples.
package exampleui

import "fmt"

// ANSI colour codes for visual distinction.
const (
	ColorReset  = "\033[0m"
	ColorDim    = "\033[38;5;244m" // Gray (compatible alternative to dim attribute)
	ColorNormal = "\033[22m"       // Normal intensity
	ColorOrange = "\033[38;5;214m" // Bright pastel orange
	ColorPurple = "\033[38;5;177m" // Bright pastel purple
)

// hsvToRGB converts HSV colour space to RGB (all values 0.0-1.0).
func hsvToRGB(h, s, v float64) (r, g, b float64) {
	if s == 0 {
		return v, v, v
	}

	h = h / 60.0
	i := int(h)
	f := h - float64(i)
	p := v * (1.0 - s)
	q := v * (1.0 - s*f)
	t := v * (1.0 - s*(1.0-f))

	switch i % 6 {
	case 0:
		return v, t, p
	case 1:
		return q, v, p
	case 2:
		return p, v, t
	case 3:
		return p, q, v
	case 4:
		return t, p, v
	default:
		return v, p, q
	}
}

// rgbToANSI256 converts RGB (0.0-1.0) to ANSI 256 colour code (16-231).
func rgbToANSI256(r, g, b float64) int {
	// Map 0.0-1.0 to 0-5 for the ANSI 6x6x6 RGB cube
	ri := int(r*5.0 + 0.5)
	gi := int(g*5.0 + 0.5)
	bi := int(b*5.0 + 0.5)

	// Clamp to valid range
	if ri > 5 {
		ri = 5
	}
	if gi > 5 {
		gi = 5
	}
	if bi > 5 {
		bi = 5
	}

	return 16 + 36*ri + 6*gi + bi
}

// ColouriseField wraps a field name with a rainbow gradient colour.
// Colours flow smoothly from red (hue 0°) to purple (hue 270°) based on position.
func ColouriseField(name string, index, total int) string {
	if total <= 1 {
		return "\033[38;5;196m" + name + ColorReset // Red fallback
	}

	// Calculate hue from 0 to 270 degrees (red to purple)
	hue := float64(index) / float64(total-1) * 270.0

	// Convert HSV to RGB with saturation and value for vibrant colours
	r, g, b := hsvToRGB(hue, 0.8, 0.95)

	// Convert RGB to ANSI 256 colour code
	colorCode := rgbToANSI256(r, g, b)

	return fmt.Sprintf("\033[38;5;%dm%s%s", colorCode, name, ColorReset)
}
