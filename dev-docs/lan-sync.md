# LAN Sync

Clipcat can optionally sync clipboard content (text and images) between devices on the same local network. No cloud, no accounts — just a shared passphrase.

## How It Works

Every Clipcat instance with sync enabled and the same passphrase automatically discovers other instances on the LAN and exchanges clipboard content in real time.

- **No sender/receiver distinction** — every peer is both. Copy on one machine, it appears on all others.
- **Peer-to-peer TCP** — data travels directly between machines, never through a server.
- **End-to-end encrypted** — AES-256-GCM with a key derived from the passphrase via PBKDF2.

## Architecture

```
┌─────────────────┐       mDNS (_clipcat._tcp)       ┌─────────────────┐
│  Machine A      │ ◄──────────────────────────────► │  Machine B       │
│  (Linux)        │                                   │  (macOS)         │
│                 │    TCP :47821 (encrypted)         │                  │
│  Port 47821     │ ◄──────────────────────────────► │  Port 47821      │
│  Passphrase: X  │                                   │  Passphrase: X   │
└─────────────────┘                                   └─────────────────┘
```

### Component stack

| Layer         | Technology                              | Purpose                                 |
| ------------- | --------------------------------------- | --------------------------------------- |
| Discovery     | mDNS via `github.com/grandcat/zeroconf` | Find other Clipcat instances on the LAN |
| Transport     | TCP, length-prefixed payloads           | Reliable delivery of clipboard data     |
| Encryption    | AES-256-GCM, PBKDF2 key derivation      | Confidentiality & authentication        |
| Peer tracking | In-memory `PeerMap` with TTL eviction   | Track alive peers, evict stale ones     |

### Wire protocol

```
[4-byte big-endian payload length][encrypted payload]
```

The encrypted payload is an envelope:

```
[1-byte type: 0=text, 1=image][content bytes]
```

## Setup

### 1. Enable sync in settings

Open the Settings panel and scroll to the **LAN Sync** section.

### 2. Set a passphrase

Enter any passphrase — it's used to derive the encryption key. **All devices must use the same passphrase.** The passphrase is never transmitted over the network.

### 3. Enable the toggle

Flip the switch. Clipcat will start mDNS discovery and listen for TCP connections on port 47821.

### 4. Verify connection

The settings panel shows a live peer count: _"X devices connected"_. When both machines are on the same LAN with sync enabled, the count should increment.

## Firewall Configuration

Clipcat uses **TCP port 47821** for sync traffic. You must open this port on each machine's firewall.

### Linux (UFW)

```bash
sudo ufw allow 47821/tcp comment 'Clipcat LAN sync'
```

### Linux (firewalld)

```bash
sudo firewall-cmd --add-port=47821/tcp --permanent
sudo firewall-cmd --reload
```

### macOS

Go to **System Settings → Network → Firewall → Options** and add Clipcat to the allowed apps, or add an exception for TCP port 47821.

### Windows Defender

Windows may prompt on first run — click **Allow access**. Or add a rule manually in **Windows Security → Firewall & network protection → Advanced settings → Inbound Rules**.

## Security Model

| Property           | Detail                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Passphrase**     | Never transmitted over the network                                                                          |
| **Key derivation** | PBKDF2 with SHA-256, 100,000 iterations, static salt `clipcat-lan-sync-v1`                                  |
| **Encryption**     | AES-256-GCM (authenticated encryption)                                                                      |
| **Wrong key**      | GCM auth failure → payload silently dropped (logged)                                                        |
| **Max payload**    | 10 MB (larger clips are silently skipped)                                                                   |
| **Discovery**      | mDNS advertises the service type `_clipcat._tcp` with the machine hostname — leaks no sensitive information |
| **Peer eviction**  | Peers not seen in 2 minutes are evicted from the peer map                                                   |

## Limitations

- **Subnet only** — mDNS discovery does not cross routers. All devices must be on the same LAN/subnet.
- **mDNS required** — Linux requires `avahi-daemon` (or another mDNS responder) to be running. macOS has Bonjour built-in.
- **Firewall required** — TCP port 47821 must be open on each machine (see above).
- **No encryption in transit indicator** — there is no visual indicator that a specific clip arrived encrypted vs. unencrypted; all sync traffic is always encrypted.
- **No peer list UI** — v1 only shows the peer count. Individual peer addresses are not displayed.

## Privacy

- Sync is fully opt-in and disabled by default.
- When disabled, Clipcat does not listen on port 47821 and does not announce itself via mDNS.
- Data is sent only over the local network — never through a cloud service or the internet.
- Network-synced clips are tagged with `source: "network"` in the database and show a small Wi-Fi icon in the clip card.

## Troubleshooting

### "0 devices connected" but machines are on the same LAN

1. **Check mDNS is working**: Run `avahi-browse _clipcat._tcp` on Linux or `dns-sd -B _clipcat._tcp local.` on macOS. If nothing appears, mDNS is blocked or not running.
2. **Check Linux mDNS**: Ensure `avahi-daemon` is running: `systemctl status avahi-daemon`.
3. **Check firewall**: Verify port 47821 is open (see Firewall Configuration above).
4. **Check passphrase**: Both machines must use the exact same passphrase.

### "sync send failed: i/o timeout"

This usually means the remote machine's firewall is blocking TCP port 47821.

### Clips sync in one direction only

Both machines must have port 47821 open. The machine that copies initiates an outgoing TCP connection to the peer. If only machine A's port is open:

- **B copies → A receives it** ✅ (B connects out to A's open port)
- **A copies → B does NOT receive it** ❌ (A tries to connect out to B's closed port)

The fix is to open port 47821 on all machines.
