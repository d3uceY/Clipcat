// Package exampleui provides terminal UI utilities for llama-go examples.
//
// This package contains formatting, colour, and display utilities used by example
// programs. It is intentionally kept internal to avoid polluting the main library
// API whilst providing shared functionality across examples.
package exampleui

import (
	"fmt"
	"strings"

	llama "github.com/tcpipuk/llama-go"
)

// DisplayModelStats renders model statistics with rainbow gradient colours and smart wrapping.
// It handles GPU info, metadata, runtime config, and generation parameters.
func DisplayModelStats(stats llama.ModelStats, maxTokens, timeout int, temp, topP float64, topK int) {
	fmt.Println()

	var fields []string

	// GPU information
	for _, gpu := range stats.GPUs {
		fields = append(fields, fmt.Sprintf("GPU %d: %s (%s MB free / %s MB total)",
			gpu.DeviceID,
			gpu.DeviceName,
			FormatNumber(gpu.FreeMemoryMB),
			FormatNumber(gpu.TotalMemoryMB)))
	}

	// Model metadata
	if stats.Metadata.Name != "" {
		modelField := stats.Metadata.Name
		if stats.Metadata.SizeLabel != "" {
			modelField += " (" + stats.Metadata.SizeLabel + ")"
		}
		fields = append(fields, "Model: "+modelField)
	}

	if stats.Metadata.Architecture != "" {
		fields = append(fields, "Architecture: "+stats.Metadata.Architecture)
	}

	// Runtime configuration
	fields = append(fields, fmt.Sprintf("Context: %s tokens", FormatNumber(stats.Runtime.ContextSize)))
	fields = append(fields, fmt.Sprintf("Batch: %d", stats.Runtime.BatchSize))
	fields = append(fields, fmt.Sprintf("KV cache: %s (%s MB)",
		stats.Runtime.KVCacheType, FormatNumber(stats.Runtime.KVCacheSizeMB)))
	fields = append(fields, fmt.Sprintf("GPU layers: %d/%d",
		stats.Runtime.GPULayersLoaded, stats.Runtime.TotalLayers))

	// Generation parameters
	fields = append(fields, fmt.Sprintf("Max tokens: %d", maxTokens))
	fields = append(fields, fmt.Sprintf("Temperature: %.2f", temp))
	fields = append(fields, fmt.Sprintf("Top-P: %.2f", topP))
	fields = append(fields, fmt.Sprintf("Top-K: %d", topK))
	fields = append(fields, fmt.Sprintf("Timeout: %ds", timeout))

	// Apply rainbow gradient to all fields
	totalFields := len(fields)
	for i := range fields {
		// Split on first colon to colourise just the field name
		parts := strings.SplitN(fields[i], ": ", 2)
		if len(parts) == 2 {
			fields[i] = ColouriseField(parts[0]+":", i, totalFields) + " " + parts[1]
		} else {
			fields[i] = ColouriseField(fields[i], i, totalFields)
		}
	}

	// Print all fields with smart wrapping
	PrintFields(fields)
	fmt.Println()
}
