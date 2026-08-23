package semantic

import (
	"math"
	"os"
	"testing"
)

// testModelPath resolves the embedding model the same way the app does
// (CLIPCAT_EMBED_MODEL override, else the Windows test default).
func testModelPath() string {
	if p := os.Getenv("CLIPCAT_EMBED_MODEL"); p != "" {
		return p
	}
	return `C:\Users\lorry\Desktop\side-projects\not-as-serious\all-MiniLM-L6-v2-Q4_K_M.gguf`
}

func cosineSim(a, b []float32) float64 {
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return math.NaN()
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

// TestEmbedRealModel exercises the full pipeline (llama-go -> GGUF ->
// []float32) with the real MiniLM model: the model loads, produces 384-dim
// vectors, and similar sentences land closer than unrelated ones. Skipped
// when the model file isn't present so the suite still passes elsewhere.
func TestEmbedRealModel(t *testing.T) {
	path := testModelPath()
	if _, err := os.Stat(path); err != nil {
		t.Skipf("model not present: %v", err)
	}

	e := NewEmbedder(path)
	t.Cleanup(e.Close)

	similar, err := e.Embed("the quick brown fox jumps over the lazy dog")
	if err != nil {
		t.Fatalf("embed similar: %v", err)
	}
	other, err := e.Embed("a fast fox leaps above a sleepy hound")
	if err != nil {
		t.Fatalf("embed other: %v", err)
	}
	unrelated, err := e.Embed("postgres database connection string")
	if err != nil {
		t.Fatalf("embed unrelated: %v", err)
	}

	if len(similar) != 384 {
		t.Fatalf("dim = %d, want 384", len(similar))
	}
	if s := cosineSim(similar, other); s < 0.5 {
		t.Fatalf("similar sentences cosine = %.3f, want > 0.5", s)
	}
	if u := cosineSim(similar, unrelated); u > 0.4 {
		t.Fatalf("unrelated sentences cosine = %.3f, want < 0.4", u)
	}
	t.Logf("cosine similar=%.3f unrelated=%.3f PASS", cosineSim(similar, other), cosineSim(similar, unrelated))
}
