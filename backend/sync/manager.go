package sync

import (
	"context"
	"log"
	"sync"
)

// OnReceiveCallback is called when a decrypted payload arrives from a peer.
type OnReceiveCallback func(payload []byte)

// Manager wires together mDNS discovery, TCP transport, and crypto to
// provide LAN clipboard sync.  Create one with NewManager, then Start/Stop.
type Manager struct {
	key      []byte
	peerMap  *PeerMap
	incoming chan []byte

	mu        sync.Mutex
	running   bool
	cancel    context.CancelFunc
	wg        sync.WaitGroup
	onReceive OnReceiveCallback
}

// NewManager creates a Manager that derives its encryption key from the
// given passphrase.  Call Start to begin discovery and listening.
func NewManager(passphrase string) *Manager {
	return &Manager{
		key:     DeriveKey(passphrase),
		peerMap: NewPeerMap(),
		// 10 deep is enough — the event loop drains each payload
		// in micros. A full buffer means the listener is overwhelmed; better
		// to drop than pile up 1GB of encrypted blobs.
		incoming: make(chan []byte, 10),
	}
}

// SetOnReceive registers a callback that is invoked for every decrypted
// payload received from the network.  Must be called before Start.
func (m *Manager) SetOnReceive(cb OnReceiveCallback) {
	m.onReceive = cb
}

// Start begins LAN discovery (mDNS announce + browse), TCP listening, and
// the event loop.  It is safe to call multiple times — subsequent calls are
// no-ops while the manager is already running.
func (m *Manager) Start() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return nil
	}
	m.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())

	added := make(chan Peer, 10)

	if err := Announce(ctx, Port, ""); err != nil {
		cancel()
		return err
	}

	go func() {
		if err := Listen(ctx, Port, m.incoming); err != nil {
			if ctx.Err() == nil {
				log.Printf("[sync] listen error: %v", err)
			}
		}
	}()

	go func() {
		if err := Browse(ctx, added); err != nil {
			if ctx.Err() == nil {
				log.Printf("[sync] browse error: %v", err)
			}
		}
	}()

	m.wg.Add(1)
	go m.eventLoop(ctx, added)

	m.mu.Lock()
	m.running = true
	m.cancel = cancel
	m.mu.Unlock()

	return nil
}

// Stop shuts down the manager, cancelling all goroutines and closing peer
// connections.  Safe to call multiple times or when not running.
func (m *Manager) Stop() {
	m.mu.Lock()
	cancel := m.cancel
	running := m.running
	if running {
		m.running = false
	}
	m.mu.Unlock()

	if !running {
		return
	}

	cancel()
	m.wg.Wait()
	m.peerMap.Stop()
}

// Restart stops the manager with a new passphrase and starts it again.
func (m *Manager) Restart(passphrase string) error {
	m.Stop()

	m.mu.Lock()
	m.key = DeriveKey(passphrase)
	m.peerMap = NewPeerMap()
	m.incoming = make(chan []byte, 10)
	m.mu.Unlock()

	return m.Start()
}

// Broadcast encrypts the payload and sends it to all currently known peers
// in a background goroutine.  The clipboard handler returns instantly;
// failed sends are logged and silently skipped.
func (m *Manager) Broadcast(payload []byte) {
	m.mu.Lock()
	key := m.key
	running := m.running
	m.mu.Unlock()

	if !running {
		return
	}

	if len(payload) > maxPayloadSize {
		log.Printf("[sync] skipping oversized payload (%d > %d bytes)", len(payload), maxPayloadSize)
		return
	}

	ciphertext, err := Encrypt(payload, key)
	if err != nil {
		log.Printf("[sync] encrypt failed: %v", err)
		return
	}

	peers := m.peerMap.GetPeers()
	if len(peers) == 0 {
		return
	}

	go func() {
		for _, p := range peers {
			ctx, cancel := context.WithTimeout(context.Background(), sendTimeout)
			if err := Send(ctx, p.Addr, ciphertext); err != nil {
				log.Printf("[sync] send to %s (%s) failed: %v", p.ID, p.Addr, err)
				if m.peerMap.RecordFailure(p.ID) {
					log.Printf("[sync] evicted peer %s (send failures)", p.ID)
				}
			} else {
				m.peerMap.ResetFailures(p.ID)
			}
			cancel()
		}
	}()
}

// PeerCount returns the number of currently known peers.
func (m *Manager) PeerCount() int {
	return m.peerMap.Len()
}

// Running returns whether the manager is currently started.
func (m *Manager) Running() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running
}

func (m *Manager) eventLoop(ctx context.Context, added <-chan Peer) {
	defer m.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case ciphertext := <-m.incoming:
			decrypted, err := Decrypt(ciphertext, m.key)
			if err != nil {
				log.Printf("[sync] decrypt failed (wrong key?): %v", err)
			} else if m.onReceive != nil {
				m.onReceive(decrypted)
			}
		case peer := <-added:
			m.peerMap.AddOrUpdate(peer.ID, peer.Addr)
		}
	}
}
