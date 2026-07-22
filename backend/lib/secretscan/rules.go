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
	{regexp.MustCompile(`AKIA[0-9A-Z]{16}`), "Cloud Access Key"},
	{regexp.MustCompile(`ASIA[0-9A-Z]{16}`), "Cloud Temp Key"},

	// ── Source control ─────────────────────────────────────────────────────
	{regexp.MustCompile(`github_pat_[A-Za-z0-9_]{20,}`), "Code Repo Token"},
	{regexp.MustCompile(`ghp_[A-Za-z0-9]{36}`), "Code Repo Token"},
	{regexp.MustCompile(`gho_[A-Za-z0-9]{36}`), "Code Repo Token"},
	{regexp.MustCompile(`ghu_[A-Za-z0-9]{36}`), "Code Repo Token"},
	{regexp.MustCompile(`ghs_[A-Za-z0-9]{36}`), "Code Repo Token"},
	{regexp.MustCompile(`ghr_[A-Za-z0-9]{36}`), "Code Repo Token"},
	{regexp.MustCompile(`glpat-[A-Za-z0-9\-_]{20,}`), "Code Repo Token"},
	{regexp.MustCompile(`npm_[A-Za-z0-9]{36}`), "Package Registry Token"},

	// ── Credit cards ───────────────────────────────────────────────────────
	{regexp.MustCompile(`\b4[0-9]{3}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Card Number"},
	{regexp.MustCompile(`\b(?:5[1-5][0-9]{2}|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Card Number"},
	{regexp.MustCompile(`\b3[47][0-9]{2}[- ]?[0-9]{6}[- ]?[0-9]{5}\b`), "Card Number"},
	{regexp.MustCompile(`\b6(?:011|5[0-9]{2})[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}\b`), "Card Number"},

	// ── Payments ───────────────────────────────────────────────────────────
	{regexp.MustCompile(`sk_live_[0-9A-Za-z]{24,}`), "Payment Secret"},
	{regexp.MustCompile(`sk_test_[0-9A-Za-z]{24,}`), "Payment Test Key"},
	{regexp.MustCompile(`pk_live_[0-9A-Za-z]{24,}`), "Payment Key"},
	{regexp.MustCompile(`pk_test_[0-9A-Za-z]{24,}`), "Payment Test Key"},

	// ── Google / GCP ───────────────────────────────────────────────────────
	{regexp.MustCompile(`AIza[0-9A-Za-z\-_]{35}`), "Cloud API Key"},
	{regexp.MustCompile(`ya29\.[0-9A-Za-z\-_]{20,}`), "Cloud Auth Token"},

	// ── Messaging / comms ──────────────────────────────────────────────────
	{regexp.MustCompile(`xox[baprs]-[0-9A-Za-z-]{10,}`), "Messaging Token"},
	{regexp.MustCompile(`[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}`), "Chat Bot Token"},
	{regexp.MustCompile(`https://discord(?:app)?\.com/api/webhooks/\d+/[A-Za-z0-9_-]+`), "Chat Webhook"},
	{regexp.MustCompile(`\d{8,10}:[A-Za-z0-9_-]{35}`), "Messaging Token"},

	// ── AI / ML ────────────────────────────────────────────────────────────
	// Increased minimum length to cut false positives on short sk- strings.
	{regexp.MustCompile(`sk-[A-Za-z0-9]{32,}`), "AI API Key"},
	{regexp.MustCompile(`sk-ant-[A-Za-z0-9\-_]{20,}`), "AI API Key"},
	{regexp.MustCompile(`hf_[A-Za-z0-9]{30,}`), "AI Platform Token"},

	// ── Telephony ──────────────────────────────────────────────────────────
	{regexp.MustCompile(`SK[a-f0-9]{32}`), "Telephony Key"},

	// ── Email services ─────────────────────────────────────────────────────
	{regexp.MustCompile(`key-[a-f0-9]{32}`), "Email API Key"},
	{regexp.MustCompile(`SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}`), "Email API Key"},
	{regexp.MustCompile(`re_[A-Za-z0-9]{24,}`), "Email API Key"},

	// ── Auth tokens / JWTs ─────────────────────────────────────────────────
	{regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`), "Auth Token"},
	// Standalone 256-bit base64-encoded secret (44 chars: 43 + one = pad).
	// Matches JWT signing secrets, randomkeygen "JWT Secrets", etc.
	{regexp.MustCompile(`(?:^|[\s'"])([A-Za-z0-9+/]{43}=)(?:$|[\s'"])`), "Crypto Key"},
	{regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*`), "Auth Token"},

	// ── Cryptographic keys / identifiers ───────────────────────────────────
	// UUID v4 - strict version/variant check keeps false-positive rate low.
	{regexp.MustCompile(`\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b`), "UUID"},
	// 256-bit hex key (64 lowercase hex chars, standalone).
	{regexp.MustCompile(`\b[a-f0-9]{64}\b`), "Crypto Key"},
	// 128-bit hex key (32 lowercase hex chars, standalone).
	{regexp.MustCompile(`\b[a-f0-9]{32}\b`), "Crypto Key"},
	// AES-GCM ciphertext: 12-byte nonce (24 hex) : variable ciphertext : 16-byte auth tag (32 hex).
	// Colon-separated hex is the dominant serialisation used by Go, Node, Python, etc.
	{regexp.MustCompile(`\b[a-f0-9]{24}:[a-f0-9]{2,}:[a-f0-9]{32}\b`), "Encrypted Data"},

	// ── Private keys / certificates ────────────────────────────────────────
	{regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`), "Private Key"},
	{regexp.MustCompile(`-----BEGIN PGP PRIVATE KEY BLOCK-----`), "Private Key"},
	{regexp.MustCompile(`-----BEGIN CERTIFICATE-----`), "Certificate"},

	// ── Database connection strings (only flag if password segment present) ─
	{regexp.MustCompile(`postgres(?:ql)?://[^:\s]+:[^@\s]{3,}@`), "Database Credential"},
	{regexp.MustCompile(`mysql://[^:\s]+:[^@\s]{3,}@`), "Database Credential"},
	{regexp.MustCompile(`mongodb(?:\+srv)?://[^:\s]+:[^@\s]{3,}@`), "Database Credential"},

	// ── SaaS platforms ────────────────────────────────────────────────────
	{regexp.MustCompile(`shpat_[a-fA-F0-9]{32}`), "E-Commerce Token"},
	{regexp.MustCompile(`dop_v1_[a-f0-9]{64}`), "Cloud API Token"},
	{regexp.MustCompile(`sl\.[A-Za-z0-9\-_]{100,}`), "Cloud Storage Token"},
	{regexp.MustCompile(`AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}`), "Cloud Messaging Key"},
	{regexp.MustCompile(`secret_[A-Za-z0-9]{43}`), "Productivity API Key"},
	{regexp.MustCompile(`sbp_[A-Za-z0-9]{30,}`), "Database PAT"},
	{regexp.MustCompile(`vercel_[A-Za-z0-9]{24,}`), "Cloud Platform Token"},

	// ── Credential assignment patterns ─────────────────────────────────────
	// Matches  password="abc123xyz"  or  secret: 'my-token'  etc.
	{regexp.MustCompile(
		`(?i)(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|client[_-]?secret|private[_-]?key|bearer)\s*[:=]\s*['"]?[^\s'"]{8,}['"]?`,
	), "Credential"},
}
