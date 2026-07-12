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
	{regexp.MustCompile(`glpat-[A-Za-z0-9\-_]{20,}`), "GitLab Personal Access Token"},
	{regexp.MustCompile(`npm_[A-Za-z0-9]{36}`), "NPM Token"},

	// ── Credit cards ───────────────────────────────────────────────────────
	{regexp.MustCompile(`\b4[0-9]{3}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Visa Card Number"},
	{regexp.MustCompile(`\b(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Mastercard Number"},
	{regexp.MustCompile(`\b3[47][0-9]{2}[- ]?[0-9]{6}[- ]?[0-9]{5}\b`), "Amex Card Number"},
	{regexp.MustCompile(`\b6(?:011|5[0-9]{2})[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Discover Card Number"},

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
	{regexp.MustCompile(`[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}`), "Discord Bot Token"},
	{regexp.MustCompile(`https://discord(?:app)?\.com/api/webhooks/\d+/[A-Za-z0-9_-]+`), "Discord Webhook"},
	{regexp.MustCompile(`\d{8,10}:[A-Za-z0-9_-]{35}`), "Telegram Bot Token"},

	// ── AI / ML ────────────────────────────────────────────────────────────
	// Increased minimum length to cut false positives on short sk- strings.
	{regexp.MustCompile(`sk-[A-Za-z0-9]{32,}`), "OpenAI API Key"},
	{regexp.MustCompile(`sk-ant-[A-Za-z0-9\-_]{20,}`), "Anthropic API Key"},
	{regexp.MustCompile(`hf_[A-Za-z0-9]{30,}`), "HuggingFace Token"},

	// ── Telephony ──────────────────────────────────────────────────────────
	{regexp.MustCompile(`SK[a-f0-9]{32}`), "Twilio API Key"},

	// ── Email services ─────────────────────────────────────────────────────
	{regexp.MustCompile(`key-[a-f0-9]{32}`), "Mailgun API Key"},
	{regexp.MustCompile(`SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}`), "SendGrid API Key"},
	{regexp.MustCompile(`re_[A-Za-z0-9]{24,}`), "Resend API Key"},

	// ── Auth tokens / JWTs ─────────────────────────────────────────────────
	{regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), "JWT Token"},
	// Standalone 256-bit base64-encoded secret (44 chars: 43 + one = pad).
	// Matches JWT signing secrets, randomkeygen "JWT Secrets", etc.
	{regexp.MustCompile(`(?:^|[\s'"])([A-Za-z0-9+/]{43}=)(?:$|[\s'"])`), "256-bit Secret"},
	{regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*`), "Bearer Token"},

	// ── Cryptographic keys / identifiers ───────────────────────────────────
	// UUID v4 - strict version/variant check keeps false-positive rate low.
	{regexp.MustCompile(`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b`), "UUID"},
	// 256-bit hex key (64 lowercase hex chars, standalone).
	{regexp.MustCompile(`\b[a-f0-9]{64}\b`), "256-bit Hex Key"},
	// 128-bit hex key (32 lowercase hex chars, standalone).
	{regexp.MustCompile(`\b[a-f0-9]{32}\b`), "128-bit Hex Key"},
	// AES-GCM ciphertext: 12-byte nonce (24 hex) : variable ciphertext : 16-byte auth tag (32 hex).
	// Colon-separated hex is the dominant serialisation used by Go, Node, Python, etc.
	{regexp.MustCompile(`\b[a-f0-9]{24}:[a-f0-9]{2,}:[a-f0-9]{32}\b`), "AES-GCM Ciphertext"},

	// ── Private keys / certificates ────────────────────────────────────────
	{regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`), "Private Key"},
	{regexp.MustCompile(`-----BEGIN PGP PRIVATE KEY BLOCK-----`), "PGP Private Key"},
	{regexp.MustCompile(`-----BEGIN CERTIFICATE-----`), "Certificate"},

	// ── Database connection strings (only flag if password segment present) ─
	{regexp.MustCompile(`postgres(?:ql)?://[^:\s]+:[^@\s]{3,}@`), "PostgreSQL Connection String"},
	{regexp.MustCompile(`mysql://[^:\s]+:[^@\s]{3,}@`), "MySQL Connection String"},
	{regexp.MustCompile(`mongodb(?:\+srv)?://[^:\s]+:[^@\s]{3,}@`), "MongoDB Connection String"},

	// ── SaaS platforms ────────────────────────────────────────────────────
	{regexp.MustCompile(`shpat_[a-fA-F0-9]{32}`), "Shopify Access Token"},
	{regexp.MustCompile(`dop_v1_[a-f0-9]{64}`), "DigitalOcean API Token"},
	{regexp.MustCompile(`sl\.[A-Za-z0-9\-_]{100,}`), "Dropbox Access Token"},
	{regexp.MustCompile(`AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}`), "Firebase Server Key"},
	{regexp.MustCompile(`secret_[A-Za-z0-9]{43}`), "Notion API Key"},
	{regexp.MustCompile(`sbp_[A-Za-z0-9]{30,}`), "Supabase PAT"},
	{regexp.MustCompile(`vercel_[A-Za-z0-9]{24,}`), "Vercel Token"},

	// ── Credential assignment patterns ─────────────────────────────────────
	// Matches  password="abc123xyz"  or  secret: 'my-token'  etc.
	{regexp.MustCompile(
		`(?i)(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key|bearer)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?`,
	), "Credential"},
}
