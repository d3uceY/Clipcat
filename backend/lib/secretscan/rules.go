package secretscan

import "regexp"

// rule pairs a compiled pattern with the human-readable label applied to the
// matched clip.  All patterns are compiled once at package initialisation.
type rule struct {
	re    *regexp.Regexp
	label string
}

// rules is the ordered list of patterns checked concurrently by Scan.
// Keep patterns specific enough to avoid false positives; prefer confirmed
// vendor prefixes over generic entropy-only rules.
var rules = []rule{
	// ── Cloud credentials ──────────────────────────────────────────────────
	{regexp.MustCompile(`AKIA[0-9A-Z]{16}`), "AWS Access Key"},
	{regexp.MustCompile(`ASIA[0-9A-Z]{16}`), "AWS Temporary Credential"},

	// ── Source control ─────────────────────────────────────────────────────
	{regexp.MustCompile(`github_pat_[A-Za-z0-9_]{20,}`), "GitHub Personal Access Token"},
	{regexp.MustCompile(`ghp_[A-Za-z0-9]{36}`), "GitHub Token"},
	{regexp.MustCompile(`gho_[A-Za-z0-9]{36}`), "GitHub OAuth Token"},
	{regexp.MustCompile(`ghu_[A-Za-z0-9]{36}`), "GitHub User Token"},
	{regexp.MustCompile(`ghs_[A-Za-z0-9]{36}`), "GitHub App Token"},
	{regexp.MustCompile(`ghr_[A-Za-z0-9]{36}`), "GitHub Refresh Token"},

	// ── Payments ───────────────────────────────────────────────────────────
	{regexp.MustCompile(`sk_live_[0-9A-Za-z]{24,}`), "Stripe Live Secret Key"},
	{regexp.MustCompile(`sk_test_[0-9A-Za-z]{24,}`), "Stripe Test Secret Key"},
	{regexp.MustCompile(`pk_live_[0-9A-Za-z]{24,}`), "Stripe Live Publishable Key"},
	{regexp.MustCompile(`pk_test_[0-9A-Za-z]{24,}`), "Stripe Test Publishable Key"},

	// ── Google / GCP ───────────────────────────────────────────────────────
	{regexp.MustCompile(`AIza[0-9A-Za-z\-_]{35}`), "Google API Key"},
	{regexp.MustCompile(`ya29\.[0-9A-Za-z\-_]{20,}`), "Google OAuth Token"},

	// ── Messaging / comms ──────────────────────────────────────────────────
	{regexp.MustCompile(`xox[baprs]-[0-9A-Za-z-]{10,}`), "Slack Token"},

	// ── AI / ML ────────────────────────────────────────────────────────────
	// Increased minimum length to cut false positives on short sk- strings.
	{regexp.MustCompile(`sk-[A-Za-z0-9]{32,}`), "OpenAI API Key"},

	// ── Telephony ──────────────────────────────────────────────────────────
	{regexp.MustCompile(`SK[a-f0-9]{32}`), "Twilio API Key"},

	// ── Email services ─────────────────────────────────────────────────────
	{regexp.MustCompile(`key-[a-f0-9]{32}`), "Mailgun API Key"},

	// ── Auth tokens / JWTs ─────────────────────────────────────────────────
	{regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), "JWT Token"},

	// ── Private keys / certificates ────────────────────────────────────────
	{regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`), "Private Key"},

	// ── Database connection strings (only flag if password segment present) ─
	{regexp.MustCompile(`postgres(?:ql)?://[^:\s]+:[^@\s]{3,}@`), "PostgreSQL Connection String"},
	{regexp.MustCompile(`mysql://[^:\s]+:[^@\s]{3,}@`), "MySQL Connection String"},
	{regexp.MustCompile(`mongodb(?:\+srv)?://[^:\s]+:[^@\s]{3,}@`), "MongoDB Connection String"},

	// ── Credential assignment patterns ─────────────────────────────────────
	// Matches  password="abc123xyz"  or  secret: 'my-token'  etc.
	{regexp.MustCompile(
		`(?i)(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key|bearer)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?`,
	), "Credential"},
}
