// Package exampleui provides terminal UI utilities for llama-go examples.
//
// This package contains formatting, colour, and display utilities used by example
// programs. It is intentionally kept internal to avoid polluting the main library
// API whilst providing shared functionality across examples.
package exampleui

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

// FormatNumber formats an integer with thousand separators for readability.
func FormatNumber(n int) string {
	if n < 1000 {
		return fmt.Sprintf("%d", n)
	}
	s := fmt.Sprintf("%d", n)
	var result strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result.WriteRune(',')
		}
		result.WriteRune(c)
	}
	return result.String()
}

// GetTerminalWidth returns the terminal width, or 80 as fallback.
func GetTerminalWidth() int {
	width, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		return 80
	}
	return width
}

// VisibleWidth calculates display width excluding ANSI escape codes.
func VisibleWidth(s string) int {
	width := 0
	inEscape := false
	for _, r := range s {
		if r == '\033' {
			inEscape = true
		} else if inEscape {
			if r == 'm' {
				inEscape = false
			}
		} else {
			width++
		}
	}
	return width
}

// PrintFields prints fields intelligently wrapped to terminal width.
// Each field is kept complete; multiple fields are separated by " | ".
func PrintFields(fields []string) {
	if len(fields) == 0 {
		return
	}

	termWidth := GetTerminalWidth()
	var currentLine strings.Builder
	currentWidth := 0

	for i, field := range fields {
		fieldWidth := VisibleWidth(field)
		separator := " | "
		separatorWidth := 3

		if i == 0 {
			// First field on first line
			currentLine.WriteString(field)
			currentWidth = fieldWidth
		} else {
			// Check if adding this field would exceed width
			if currentWidth+separatorWidth+fieldWidth > termWidth {
				// Print current line and start new line
				fmt.Println(currentLine.String())
				currentLine.Reset()
				currentLine.WriteString(field)
				currentWidth = fieldWidth
			} else {
				// Add to current line
				currentLine.WriteString(separator)
				currentLine.WriteString(field)
				currentWidth += separatorWidth + fieldWidth
			}
		}
	}

	// Print final line
	if currentLine.Len() > 0 {
		fmt.Println(currentLine.String())
	}
}

// WordWrapper handles word-boundary text wrapping for streaming output.
type WordWrapper struct {
	maxWidth   int
	linePos    int
	wordBuffer strings.Builder
}

// NewWordWrapper creates a wrapper with the given maximum line width.
func NewWordWrapper(maxWidth int) *WordWrapper {
	return &WordWrapper{
		maxWidth: maxWidth,
		linePos:  0,
	}
}

// Write outputs text with word-boundary wrapping.
func (w *WordWrapper) Write(text string) {
	for _, r := range text {
		if r == '\n' {
			// Explicit newline - flush word buffer and reset
			w.flushWord()
			fmt.Print("\n")
			w.linePos = 0
		} else if r == ' ' {
			// End of word - flush word then handle space
			w.flushWord()

			// Output space (or newline if we're at width)
			if w.linePos >= w.maxWidth {
				fmt.Print("\n")
				w.linePos = 0
			} else {
				fmt.Print(" ")
				w.linePos++
			}
		} else {
			// Part of a word - add to buffer
			w.wordBuffer.WriteRune(r)
		}
	}
}

// flushWord outputs the buffered word, wrapping if needed.
func (w *WordWrapper) flushWord() {
	if w.wordBuffer.Len() == 0 {
		return
	}

	wordLen := w.wordBuffer.Len()

	// Wrap if word won't fit on current line (unless line is empty)
	if w.linePos > 0 && w.linePos+wordLen > w.maxWidth {
		fmt.Print("\n")
		w.linePos = 0
	}

	// Output word
	word := w.wordBuffer.String()
	fmt.Print(word)
	w.linePos += wordLen
	w.wordBuffer.Reset()
}

// SetLinePos updates the current line position (for handling prefixes).
func (w *WordWrapper) SetLinePos(pos int) {
	w.linePos = pos
}

// Flush outputs any remaining buffered text.
func (w *WordWrapper) Flush() {
	w.flushWord()
}
