# Security Policy

## Supported Versions

Only the latest release gets fixes. There are no maintenance branches and no
backports.

| Version | Supported |
|---|---|
| Latest release | Yes |
| Anything older | No |

## Reporting a Vulnerability

Do not open a public issue for a vulnerability. Use GitHub's private reporting
on the [Security tab](https://github.com/d3uceY/Clipcat/security) if the *Report a
vulnerability* button is there, otherwise email
**onyekwelujesse1234@gmail.com** with `Clipcat security` in the subject.

Include what you can:

- Clipcat version (About dialog) and OS
- What an attacker can do, and what they need to already have
- Steps to reproduce, or a proof of concept
- Any errors or logs

You will get an acknowledgement, and updates as the fix moves. Credit in the
release notes if you want it, anonymous if you do not. Please give a fix a
chance to ship before writing about it publicly.

## In Scope

- The desktop app itself (`app.go`, `backend/`) on Windows, macOS, and Linux
- LAN sync: peer discovery, transport, and the AES-256-GCM / PBKDF2 layer in
  `backend/sync/`
- Sensitive-content detection in `backend/lib/secretscan/` (a bypass that leaks
  a real credential into the visible list, not a missed pattern)
- The clipboard listener and hotkey handling
- The update check and its response handling
- Release artifacts: the NSIS installer, the `.dmg`, the `.deb`, and the
  workflows that build them
- Dependencies, if the issue is reachable through Clipcat's use of them

## Known Limitations

These are deliberate and already known. They are not vulnerabilities, and
reports about them will be closed as such.

- **The clip database is not encrypted at rest.** Clips are stored as plaintext
  SQLite in your user profile (see
  [Privacy & Security](https://getclipcat.com/docs/privacy-security)). Protection is
  whatever your OS file permissions and disk encryption give you. Anything that
  requires reading files as your user, or as an admin, is out of scope.
- **LAN sync trusts the passphrase.** Anyone on the same network who knows it can
  read and inject clips. The PBKDF2 key derivation uses a static salt, so the
  same passphrase yields the same key on every install and a weak passphrase is
  guessable offline. Pick a long one, or leave sync off.
- **Auto-hide sensitive is a heuristic.** It is pattern and entropy matching, not
  a guarantee. Missed secrets are expected, so treat the visible list as
  untrusted rather than as proof there is nothing sensitive in it.
- **Privacy Mode blurs the UI, it does not redact data.** Screenshots aside, the
  content is still on screen for anything that can read the window.
- **No account, no cloud, no telemetry.** Clipcat never sends clipboard content
  anywhere except to LAN peers you paired with.

## Out of Scope

- Attacks that need an already-compromised machine, local admin, or physical
  access
- Someone reading the SQLite file directly as your user
- Social engineering, and anything requiring you to run a modified build
- Missing hardening headers or config on the docs site
- Findings from automated scanners with no demonstrated impact
