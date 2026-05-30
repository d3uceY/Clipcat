package secretscan

import "regexp"

// credentialKeywordRe matches text that contains a keyword strongly
// suggesting a credential assignment context.  Used by entropyCheck to
// avoid flagging random high-entropy strings that have no secret context.
var credentialKeywordRe = regexp.MustCompile(
	`(?i)\b(?:password|passwd|pwd|secret|token|apikey|api_key|api-key|access_key|access-key|private_key|private-key|client_secret|auth_token|bearer)\b`,
)
