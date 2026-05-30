# Key, Secret, Token, and Password Pattern Detection Guide

## Overview

Detecting credentials, secrets, and authentication artifacts typically relies on:

1. Prefix detection
2. Character set analysis
3. Length analysis
4. Entropy analysis
5. Structural pattern matching
6. Contextual keyword analysis
7. Statistical classification
8. Machine learning approaches

No single method is perfect. Most secret scanners combine multiple techniques.

---

# 1. Prefix-Based Detection

Many providers use identifiable prefixes.

## Cloud Providers

### AWS

| Type | Pattern |
|---------|---------|
| Access Key ID | `AKIA[0-9A-Z]{16}` |
| Temporary Key | `ASIA[0-9A-Z]{16}` |

Examples:

```text
AKIAIOSFODNN7EXAMPLE
ASIAIOSFODNN7EXAMPLE
```

---

### Google Cloud

```text
AIza...
```

Regex:

```regex
AIza[0-9A-Za-z\-_]{35}
```

---

### Stripe

```text
sk_live_
sk_test_
pk_live_
pk_test_
```

Regex:

```regex
(sk|pk)_(live|test)_[0-9A-Za-z]{20,}
```

---

### GitHub

```text
github_pat_
ghp_
gho_
ghu_
ghs_
ghr_
```

Regex:

```regex
github_pat_[A-Za-z0-9_]+
```

---

### Slack

```text
xoxp-
xoxb-
xoxa-
xoxr-
```

Regex:

```regex
xox[baprs]-[0-9A-Za-z-]+
```

---

### Discord

Bot tokens often resemble:

```text
MTI4NjY.......
```

Structure:

```text
base64.base64.signature
```

---

### OpenAI

```text
sk-...
```

Regex:

```regex
sk-[A-Za-z0-9]{20,}
```

---

### Twilio

```text
SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Regex:

```regex
SK[a-f0-9]{32}
```

---

### Mailgun

```text
key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Regex:

```regex
key-[a-f0-9]{32}
```

---

# 2. JWT Detection

JSON Web Tokens contain three Base64URL sections.

Format:

```text
xxxxx.yyyyy.zzzzz
```

Regex:

```regex
eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+
```

Example:

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

# 3. Base64 Detection

Common characteristics:

- A-Z
- a-z
- 0-9
- +
- /
- Ends with `=` or `==`

Regex:

```regex
(?:[A-Za-z0-9+/]{4})*
(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?
```

Examples:

```text
dGVzdA==
c2VjcmV0a2V5
```

---

# 4. Base64URL Detection

Used by JWTs and OAuth systems.

Character set:

```text
A-Z
a-z
0-9
_
-
```

Example:

```text
eyJhbGciOiJIUzI1NiJ9
```

---

# 5. Hexadecimal Detection

Characters:

```text
0-9
a-f
A-F
```

## Common Lengths

| Length | Meaning |
|----------|----------|
| 32 | MD5 |
| 40 | SHA1 |
| 56 | SHA224 |
| 64 | SHA256 |
| 96 | SHA384 |
| 128 | SHA512 |

Regex:

```regex
\b[a-fA-F0-9]{32,128}\b
```

---

# 6. UUID Detection

Format:

```text
8-4-4-4-12
```

Regex:

```regex
\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b
```

Example:

```text
123e4567-e89b-12d3-a456-426614174000
```

---

# 7. SSH Key Detection

## RSA

Starts with:

```text
ssh-rsa
```

---

## ED25519

Starts with:

```text
ssh-ed25519
```

---

## ECDSA

Starts with:

```text
ecdsa-sha2-nistp256
```

---

Regex:

```regex
(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256)\s+[A-Za-z0-9+/=]+
```

---

# 8. PEM Certificate Detection

Private Keys:

```text
-----BEGIN PRIVATE KEY-----
```

RSA Keys:

```text
-----BEGIN RSA PRIVATE KEY-----
```

Certificates:

```text
-----BEGIN CERTIFICATE-----
```

Regex:

```regex
-----BEGIN .*?-----
```

---

# 9. OAuth Tokens

Often:

```text
ya29.
```

Google OAuth:

```regex
ya29\.[0-9A-Za-z\-_]+
```

---

# 10. Password Detection

## Keyword-Based

Variables:

```text
password
passwd
pwd
secret
token
apikey
api_key
access_key
private_key
client_secret
auth_token
```

Regex:

```regex
(password|passwd|pwd|secret|token|apikey|api_key)
```

---

## Assignment Detection

Examples:

```text
password=123456
password: hunter2
secret = abcdef
```

Regex:

```regex
(?i)(password|secret|token|apikey)\s*[:=]\s*['"]?.+['"]?
```

---

# 11. Database Connection Strings

## PostgreSQL

```text
postgres://user:password@host/db
```

Regex:

```regex
postgres(?:ql)?:\/\/
```

---

## MySQL

```text
mysql://user:password@host
```

---

## MongoDB

```text
mongodb://
mongodb+srv://
```

Regex:

```regex
mongodb(\+srv)?:\/\/
```

---

# 12. Cryptocurrency Keys

## Bitcoin Private Key (WIF)

Starts with:

```text
5
K
L
```

Length:

```text
51-52 chars
```

---

## Ethereum Private Key

```text
64 hex chars
```

Example:

```text
4c0883a69102937d623414...
```

---

# 13. Hash Identification

## MD5

```text
32 hex chars
```

Regex:

```regex
[a-f0-9]{32}
```

---

## SHA1

```text
40 hex chars
```

Regex:

```regex
[a-f0-9]{40}
```

---

## SHA256

```text
64 hex chars
```

Regex:

```regex
[a-f0-9]{64}
```

---

# 14. Entropy-Based Detection

High-entropy strings are likely secrets.

Example:

```text
w8Jf#2L!p9qZ@N4xT7rK
```

Low entropy:

```text
password123
```

---

## Shannon Entropy Formula

```text
H = -Σ p(x) log2 p(x)
```

Typical thresholds:

| Entropy | Meaning |
|----------|----------|
| < 3.5 | Human text |
| 3.5-4.5 | Mixed |
| > 4.5 | Potential secret |
| > 5.5 | Strong secret |

---

# 15. Secret Scanner Heuristics

Typical scoring factors:

| Signal | Score |
|----------|----------|
| Known prefix | +100 |
| High entropy | +50 |
| Base64 format | +30 |
| Variable named secret | +80 |
| JWT format | +70 |
| Hex key length | +40 |

Combined score determines confidence.

---

# 16. Contextual Detection

High-risk variable names:

```text
secret
password
token
apikey
clientsecret
privatekey
bearer
authorization
credential
```

Examples:

```javascript
const apiKey = "...";
const secret = "...";
```

---

# 17. File-Based Detection

Sensitive files:

```text
.env
.env.local
.env.production

id_rsa
id_ed25519

credentials.json
service-account.json

secrets.yml
secrets.yaml

config.json
```

---

# 18. AI-Assisted Detection

Modern scanners use:

- LLM classification
- Embedding similarity
- Context-aware analysis
- Repository-wide correlation
- Semantic understanding

Example:

```javascript
const authToken = process.env.API_TOKEN;
```

Even if token value does not match regex patterns, AI can infer sensitivity.

---

# 19. False Positive Reduction

Common exclusions:

```text
example
sample
test
dummy
placeholder
localhost
```

Known safe patterns:

```text
YOUR_API_KEY_HERE
REPLACE_ME
EXAMPLE_TOKEN
```

---

# 20. Recommended Detection Pipeline

1. Extract strings
2. Detect known prefixes
3. Detect JWTs
4. Detect Base64
5. Detect Hex
6. Calculate entropy
7. Analyze variable names
8. Analyze surrounding context
9. Score confidence
10. Flag findings

---

# Detection Confidence Levels

| Confidence | Description |
|------------|-------------|
| Very High | Known vendor prefix |
| High | Prefix + entropy |
| Medium | High entropy only |
| Low | Context only |
| Ignore | Placeholder values |

---

# Common Secret Categories

- API Keys
- Access Tokens
- Refresh Tokens
- JWTs
- OAuth Tokens
- SSH Keys
- TLS Certificates
- Database Credentials
- Cloud Credentials
- Private Keys
- Signing Keys
- Encryption Keys
- Webhook Secrets
- Session Tokens
- Bearer Tokens
- Service Account Credentials