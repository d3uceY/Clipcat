package sync

import (
	"context"
	"log"
	"sync"
	"time"
)

const (
	// peerTTL is how long a peer is considered alive without a heartbeat.
	peerTTL = 2 * time.Minute

	// evictionInterval is how often the eviction ticker runs.
	evictionInterval = 60 * time.Second
)

// Peer represents a single Clipcat instance discovered on the LAN.
type Peer struct {
	ID       string    `json:"id"`
	Addr     string    `json:"addr"`
	LastSeen time.Time `json:"lastSeen"`
}

// PeerMap is a concurrency-safe map of peers with automatic eviction of
// peers that have not been seen within peerTTL.
type PeerMap struct {
	mu     sync.RWMutex
	peers  map[string]*Peer
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewPeerMap creates a PeerMap and starts the eviction loop in a background
// goroutine.  Call Stop to shut down the eviction loop.
func NewPeerMap() *PeerMap {
	ctx, cancel := context.WithCancel(context.Background())
	pm := &PeerMap{
		peers:  make(map[string]*Peer),
		cancel: cancel,
	}
	pm.wg.Add(1)
	go pm.evictionLoop(ctx)
	return pm
}

// evictionLoop runs until ctx is cancelled, evicting stale peers every
// evictionInterval.
func (pm *PeerMap) evictionLoop(ctx context.Context) {
	defer pm.wg.Done()
	ticker := time.NewTicker(evictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pm.evictStale()
		}
	}
}

func (pm *PeerMap) evictStale() {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	now := time.Now()
	for id, p := range pm.peers {
		if now.Sub(p.LastSeen) > peerTTL {
			log.Printf("[sync] evicting stale peer %s (%s)", id, p.Addr)
			delete(pm.peers, id)
		}
	}
}

// AddOrUpdate records or refreshes a peer.  If a peer with the same ID
// already exists its address and LastSeen are updated.
func (pm *PeerMap) AddOrUpdate(id, addr string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if existing, ok := pm.peers[id]; ok {
		existing.Addr = addr
		existing.LastSeen = time.Now()
		return
	}

	pm.peers[id] = &Peer{
		ID:       id,
		Addr:     addr,
		LastSeen: time.Now(),
	}
	log.Printf("[sync] new peer %s at %s", id, addr)
}

// GetPeers returns a snapshot of all currently known peers.
func (pm *PeerMap) GetPeers() []Peer {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make([]Peer, 0, len(pm.peers))
	for _, p := range pm.peers {
		result = append(result, *p) // copy
	}
	return result
}

// Remove deletes a peer by ID.  Called when mDNS signals a service
// disappearance.
func (pm *PeerMap) Remove(id string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()
	delete(pm.peers, id)
}

// Len returns the number of currently known peers.
func (pm *PeerMap) Len() int {
	pm.mu.RLock()
	defer pm.mu.RUnlock()
	return len(pm.peers)
}

// Stop shuts down the eviction loop and waits for it to finish.
func (pm *PeerMap) Stop() {
	pm.cancel()
	pm.wg.Wait()
}
