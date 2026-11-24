# Encryption at Rest

Text clip bodies are encrypted in `gyatt.db`. The key lives in the OS keychain,
never in the database. Images and metadata stay plaintext by design.

Code: `backend/store/crypt.go` (keys, sealing), `backend/store/index.go`
(in-memory search), `backend/store/db.go` (schema and migrations).

---

## What is protected

| Data | Storage | Encrypted |
| --- | --- | --- |
| `clips.content` (text bodies) | base64(nonce || AES-256-GCM ciphertext) | Yes |
| `clips.content_hash` (text) | HMAC-SHA256 under a derived key | Keyed |
| `clips_fts` | `:memory:` SQLite, rebuilt each launch | Never on disk |
| `clips.image`, `clips.thumbnail` | PNG / JPEG bytes | No |
| `clips.pinned`, `hidden`, `label`, `created_at`, `source` | plain columns | No |
| `settings.sync_passphrase` | plain column | No (follow-up) |

The implication for the docs: a database viewer shows ciphertext for text clips;
image clips and the fact that a clip exists are still visible.

---

## Key lifecycle

1. `RunMigrations` creates `storage_meta` and calls `InitStorageKey(dir)`.
2. The key is read from the backend recorded in `storage_meta.key_backend`
   first, then the other backend. A key whose id does not match
   `storage_meta.key_id` is rejected.
3. No key anywhere + no recorded key id (fresh install or a database written by
   the plaintext build) -> generate 32 random bytes, store them, record
   `key_id` + `key_backend`.
4. No key anywhere + a recorded key id -> startup fails. Generating a new key
   would make every existing clip unreadable, so the app refuses instead.

Backends:

- `keyring` - Windows Credential Manager, macOS Keychain, or Secret Service via
  `github.com/zalando/go-keyring` (pure Go, no cgo).
- `file` - `<app data dir>/storage.key`, mode `0600`. Used when no keychain is
  available (headless Linux, sandboxes).

The key value is `v1.<key id>.<base64 key>`; the id is what `storage_meta`
records, so a swapped key is detected rather than silently producing garbage.

### Derived keys

HKDF-SHA256, no salt, distinct info strings:

- `clipcat clip content v1` -> AES-256-GCM key for clip text
- `clipcat clip hash v1` -> HMAC-SHA256 key for duplicate detection

Sealing uses a random 12-byte nonce and AAD `clipcat/clips/content/v1`. The AAD
binds a ciphertext to its column; a blob moved into another column fails to
open. Row ids cannot be bound because they do not exist before `INSERT`.

---

## Row format

`clips.enc_version` says how to read `content`:

| enc_version | Meaning |
| --- | --- |
| 0 | Plaintext (pre-encryption row, or an image clip) |
| 1 | `base64(nonce || ciphertext)`, AAD `clipcat/clips/content/v1` |

Readers dispatch per row, so a half-finished migration still reads correctly.

---

## Startup order

```
InitDB(path)                  // single connection, PRAGMA secure_delete=ON
RunMigrations(appDir)
  ├─ CreateTables             // storage_meta, enc_version
  ├─ ALTER TABLE ...          // additive columns
  ├─ InitStorageKey(appDir)
  ├─ MigrateEncryptClips()    // seal enc_version = 0 rows in batches
  ├─ dropLegacyPlaintext()    // drop clips_fts*, encryption_meta, encrypted; VACUUM once
  └─ OpenIndex()              // in-memory FTS5, rebuilt from decrypted rows
```

A key or index failure returns an error, which aborts Wails startup. Nothing
else closes the handles: `app.go` registers `OnShutdown` to call
`CloseIndex` and `CloseDB`.

---

## Migration from the plaintext build

`MigrateEncryptClips` selects `type = 'text' AND enc_version = 0` with a
non-empty body, seals each row, replaces `content_hash` with the keyed HMAC, and
sets `enc_version = 1`. Batches of 200 run in a transaction. A failure leaves
earlier batches sealed and the rest readable as plaintext; the next launch
resumes.

`dropLegacyPlaintext` then removes every table that used to hold a second copy
of the text:

- `clips_fts` and its shadow tables (`clips_fts_data`, `_idx`, `_content`,
  `_docsize`, `_config`)
- `encryption_meta`, the old in-database key
- the dead `encrypted` column

It runs `VACUUM` once, gated on `storage_meta.legacy_cleaned`, so the freed
pages actually leave the file. `PRAGMA secure_delete = ON` zeroes pages freed by
individual `UPDATE`s in between.

---

## Write and read paths

Writes seal before `INSERT`/`UPDATE`. `AddClip`, `AddManualClip` and
`AddImageClip` run dedupe-read -> state capture -> delete -> insert -> prune in a
single transaction (`querier` is satisfied by both `*sql.DB` and `*sql.Tx`).
Index writes happen after commit; the index is rebuilt from disk on every launch,
so a crash there only leaves a stale hit until restart.

Reads decrypt in `buildClip` (list previews) and `GetClipContent` (full text).
A row that fails to decrypt logs and renders without a preview instead of
failing the whole list.

Dedupe is an equality check on `content_hash` plus `type`. The old
`content = ?` fallback was removed with the plaintext column and was also the
type-blind duplicate bug.

---

## Limits

- **The index is plaintext in RAM.** It is never written to `gyatt.db`, but it
  can be paged to swap or captured in a hibernation file like any other process
  memory. Closing the app drops it.
- **AAD binds the column, not the row.** Someone who can write the database file
  could swap two text values and the app would show each under the other's row.
  They cannot read either value, forge one, or move a text value into another
  column.
- **The fallback key file sits next to the database.** Without a keychain,
  "encrypted at rest" means the database is unreadable without
  `storage.key` - not that the key lives somewhere else.
- **`secure_delete` is set once on the single pooled connection.** If the driver
  ever replaced that connection, the pragma would be off until the next launch;
  the one-time `VACUUM` is what removes the historical plaintext for good.
- **Images and metadata stay readable.** See the table above.

---

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Keychain entry deleted, database present | Startup error naming the key id; no new key is generated |
| Keychain unavailable (headless Linux) | Falls back to `storage.key`; `key_backend` records `file` |
| Keychain available later | The recorded backend is read first; the file key still wins |
| Database copied to a machine without the key | Startup error; clips stay unreadable |
| One row fails to decrypt | Logged, preview omitted, search skips it; the app runs |
| An older build opens a sealed database | Text shows as binary; the old build's decrypt path only touches `encrypted = 1`, which this build never writes |

Downgrade is not supported; there is no un-encrypt task.

---

## Tests

`go test ./backend/store` covers:

- seal/open round trip, fresh nonce per seal, tamper, wrong AAD, wrong key
- key-file fallback and refusal to mint a key when `storage_meta.key_id` exists
- migration of a legacy plaintext database: row sealed, `clips_fts*` and
  `encryption_meta` gone, search still finds the clip, and the raw file no
  longer contains the clip text
- text stored as ciphertext while previews, full text, edits and search work
- images stay unencrypted, dedupe still works

Manual check against a real database:

```bash
cp "$APPDATA/clipussy/db/gyatt.db" /tmp/gyatt.db
strings /tmp/gyatt.db | grep '<a phrase you know you copied>'   # no output
sqlite3 /tmp/gyatt.db ".tables"                                  # no clips_fts*
```
