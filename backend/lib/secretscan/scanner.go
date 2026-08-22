// Package secretscan provides concurrent pattern-based detection of secrets,
// credentials, and sensitive tokens within arbitrary text.
//
// Usage:
//
//	result := secretscan.Scan(text)
//	if result.IsSecret {
//	    fmt.Println("detected:", result.Label)
//	}
package secretscan

import (
	"math"
)

// Result is returned by Scan.
type Result struct {
	// IsSecret is true when at least one pattern matched.
	IsSecret bool
	// Label is a short human-readable description of the matched pattern
	// (e.g. "AWS Access Key", "JWT Token").  Empty when IsSecret is false.
	Label string
}

// Scan runs all detection rules against text and returns the first match
// found.  Clipboard-sized strings make a serial loop over the compiled
// regexes negligible, so no fan-out is needed.
func Scan(text string) Result {
	if len(text) == 0 {
		return Result{}
	}

	for _, r := range rules {
		if r.re.MatchString(text) {
			return Result{IsSecret: true, Label: r.label}
		}
	}

	// Shannon-entropy check combined with a keyword context requirement to
	// keep the false-positive rate low.
	if label, ok := entropyCheck(text); ok {
		return Result{IsSecret: true, Label: label}
	}

	return Result{}
}

// entropyCheck flags strings that have very high Shannon entropy AND contain
// a credential-related keyword, reducing false positives on regular text.
func entropyCheck(text string) (string, bool) {
	const (
		minLength       = 32
		entropyThreshold = 4.5
	)

	// Quick pre-check: does the text contain a credential keyword?
	if !credentialKeywordRe.MatchString(text) {
		return "", false
	}

	// Extract the longest whitespace-free token and measure its entropy.
	token := longestToken(text)
	if len(token) < minLength {
		return "", false
	}
	if shannonEntropy(token) >= entropyThreshold {
		return "High-Entropy Secret", true
	}
	return "", false
}

// longestToken returns the longest run of non-whitespace characters in s.
func longestToken(s string) string {
	best := ""
	cur := ""
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if len(cur) > len(best) {
				best = cur
			}
			cur = ""
		} else {
			cur += string(r)
		}
	}
	if len(cur) > len(best) {
		best = cur
	}
	return best
}

// shannonEntropy computes the Shannon entropy (bits per character) of s.
func shannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}
	freq := make(map[rune]int, 64)
	for _, c := range s {
		freq[c]++
	}
	n := float64(len(s))
	var h float64
	for _, count := range freq {
		p := float64(count) / n
		h -= p * math.Log2(p)
	}
	return h
}
