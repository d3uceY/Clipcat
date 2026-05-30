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
	"context"
	"math"
	"sync"
)

// Result is returned by Scan.
type Result struct {
	// IsSecret is true when at least one pattern matched.
	IsSecret bool
	// Label is a short human-readable description of the matched pattern
	// (e.g. "AWS Access Key", "JWT Token").  Empty when IsSecret is false.
	Label string
}

// Scan runs all detection rules concurrently against text and returns the
// first match found.  The function is safe for concurrent use.
func Scan(text string) Result {
	if len(text) == 0 {
		return Result{}
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Buffered channel so goroutines that win the race don't block.
	ch := make(chan string, 1)

	var wg sync.WaitGroup

	// Fan-out: one goroutine per regexp rule.
	for _, r := range rules {
		wg.Add(1)
		go func(r rule) {
			defer wg.Done()
			// Bail early if another goroutine already won.
			select {
			case <-ctx.Done():
				return
			default:
			}
			if r.re.MatchString(text) {
				select {
				case ch <- r.label:
					cancel() // signal all other goroutines to stop
				default:
				}
			}
		}(r)
	}

	// Additional goroutine: Shannon-entropy check combined with a keyword
	// context requirement to keep the false-positive rate low.
	wg.Add(1)
	go func() {
		defer wg.Done()
		select {
		case <-ctx.Done():
			return
		default:
		}
		if label, ok := entropyCheck(text); ok {
			select {
			case ch <- label:
				cancel()
			default:
			}
		}
	}()

	// Close ch once all goroutines finish so the receive below terminates.
	go func() {
		wg.Wait()
		close(ch)
	}()

	label, ok := <-ch
	return Result{IsSecret: ok, Label: label}
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
