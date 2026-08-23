// Package exampleui provides terminal UI utilities for llama-go examples.
//
// This package contains formatting, colour, and display utilities used by example
// programs. It is intentionally kept internal to avoid polluting the main library
// API whilst providing shared functionality across examples.
package exampleui

import (
	"bufio"
	"fmt"
	"strings"

	llama "github.com/tcpipuk/llama-go"
)

// DisplaySystemPrompt shows the system prompt in dimmed style.
func DisplaySystemPrompt(prompt string) {
	fmt.Printf("%s(%s)%s\n", ColorDim, prompt, ColorReset)
}

// PromptUser displays a coloured prompt and reads a line of input.
// Returns the trimmed input string and any scanner error.
// Returns empty string with nil error to indicate clean EOF.
func PromptUser(scanner *bufio.Scanner) (string, error) {
	fmt.Print(ColorOrange + "You: " + ColorReset)
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return "", err
		}
		// EOF - return empty with nil error to indicate clean exit
		return "", nil
	}
	return strings.TrimSpace(scanner.Text()), nil
}

// PromptUserSimple displays a simple prompt without colours (for non-streaming examples).
// Returns the trimmed input string and any scanner error.
// Returns empty string with nil error to indicate clean EOF.
func PromptUserSimple(scanner *bufio.Scanner) (string, error) {
	fmt.Print("You: ")
	if !scanner.Scan() {
		if err := scanner.Err(); err != nil {
			return "", err
		}
		// EOF - return empty with nil error to indicate clean exit
		return "", nil
	}
	return strings.TrimSpace(scanner.Text()), nil
}

// DisplayDebugInfo shows conversation history and formatted prompt for debugging.
func DisplayDebugInfo(messages []llama.ChatMessage, formattedPrompt string, formatErr error) {
	fmt.Println("\n[DEBUG] Conversation history being sent:")
	for i, msg := range messages {
		preview := msg.Content
		if len(preview) > 60 {
			preview = preview[:57] + "..."
		}
		fmt.Printf("  %d. %s: %s\n", i+1, msg.Role, preview)
	}

	if formatErr != nil {
		fmt.Printf("\n[DEBUG] Error formatting prompt: %v\n\n", formatErr)
	} else {
		fmt.Println("\n[DEBUG] Formatted prompt after template processing:")
		fmt.Println("--- BEGIN PROMPT ---")
		fmt.Print(formattedPrompt)
		fmt.Println("--- END PROMPT ---")
	}
}

// StreamRenderer handles visual rendering of streaming chat responses.
// It manages reasoning vs content output, colour transitions, wrapping, and prefixes.
type StreamRenderer struct {
	wrapper          *WordWrapper
	inReasoning      bool
	hasStarted       bool
	content          strings.Builder
	reasoningContent strings.Builder
}

// NewStreamRenderer creates a renderer with terminal-width wrapping.
func NewStreamRenderer() *StreamRenderer {
	return &StreamRenderer{
		wrapper: NewWordWrapper(GetTerminalWidth()),
	}
}

// ProcessDelta renders a single chat delta with appropriate formatting.
func (r *StreamRenderer) ProcessDelta(delta llama.ChatDelta) {
	// Handle reasoning content (displayed dimmed in parentheses)
	if delta.ReasoningContent != "" {
		if !r.hasStarted {
			fmt.Print("\n" + ColorDim + "(")
			r.wrapper.SetLinePos(1)
			r.hasStarted = true
			r.inReasoning = true
		} else if !r.inReasoning {
			// Switching from content back to reasoning
			r.wrapper.Flush()
			fmt.Print(ColorDim)
			r.wrapper.SetLinePos(0)
			r.inReasoning = true
		}
		r.wrapper.Write(delta.ReasoningContent)
		r.reasoningContent.WriteString(delta.ReasoningContent)
	}

	// Handle regular content
	if delta.Content != "" {
		if !r.hasStarted {
			// Starting with content (no reasoning)
			prefix := "Assistant: "
			fmt.Print("\n" + ColorPurple + prefix + ColorReset)
			r.wrapper.SetLinePos(len(prefix))
			r.hasStarted = true
		} else if r.inReasoning {
			// Switch from reasoning to content
			r.wrapper.Flush()
			prefix := "Assistant: "
			fmt.Print(")\n\n" + ColorPurple + prefix + ColorReset)
			r.wrapper.SetLinePos(len(prefix))
			r.inReasoning = false
		}
		r.wrapper.Write(delta.Content)
		r.content.WriteString(delta.Content)
	}
}

// Finish completes the stream rendering and returns accumulated content.
func (r *StreamRenderer) Finish() string {
	r.wrapper.Flush()
	if r.inReasoning {
		fmt.Print(")" + ColorReset)
	} else {
		fmt.Print(ColorReset)
	}
	fmt.Println()
	fmt.Println()
	return r.content.String()
}

// HandleError renders an error message and returns accumulated content.
func (r *StreamRenderer) HandleError(err error) string {
	r.wrapper.Flush()
	fmt.Print(ColorReset)
	fmt.Printf("\n\nGeneration error: %v\n", err)
	return r.content.String()
}

// HandleTimeout renders a timeout message and returns accumulated content.
func (r *StreamRenderer) HandleTimeout(ctxErr error) string {
	r.wrapper.Flush()
	fmt.Print(ColorReset)
	fmt.Printf("\n\n[Timeout: %v]\n", ctxErr)
	return r.content.String()
}

// GetContent returns the accumulated content without finishing rendering.
func (r *StreamRenderer) GetContent() string {
	return r.content.String()
}
