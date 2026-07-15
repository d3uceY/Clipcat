package sync

import (
	"sync"
	"time"
)

const (
	// maxFailCount is the number of consecutive TCP failures before a peer
	// is evicted.  Reset to 0 on any successful send or heartbeat.
	maxFailCount = 3
)

// Peer represents a single Clipcat instance discovered on the LAN.
type Peer struct {
	ID        string    `json:"id"`
	Addr      string    `json:"addr"`
	LastSeen  time.Time `json:"lastSeen"`
	failCount int       // consecutive TCP failures (internal, not exported)
}

// PeerMap is a concurrency-safe map of peers.  Peers are only removed when
// RecordFailure reaches maxFailCount — there is no TTL-based eviction.
// Re-discovery via mDNS will re-add evicted peers when they come back.
type PeerMap struct {
	mu    sync.RWMutex
	peers map[string]*Peer
}

// NewPeerMap creates an empty PeerMap.  No background goroutines.
func NewPeerMap() *PeerMap {
	return &PeerMap{
		peers: make(map[string]*Peer),
	}
}

// AddOrUpdate records or refreshes a peer.  If a peer with the same ID
// already exists its address and LastSeen are updated and its failure
// count is reset (a new mDNS announcement means the peer is alive).
func (pm *PeerMap) AddOrUpdate(id, addr string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if existing, ok := pm.peers[id]; ok {
		existing.Addr = addr
		existing.LastSeen = time.Now()
		existing.failCount = 0 // fresh announcement = alive
		return
	}

	pm.peers[id] = &Peer{
		ID:       id,
		Addr:     addr,
		LastSeen: time.Now(),
	}
}

// RecordFailure increments a peer's failure counter.  Returns true when
// the counter reaches maxFailCount, signalling the caller to evict.
func (pm *PeerMap) RecordFailure(id string) bool {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	p, ok := pm.peers[id]
	if !ok {
		return false
	}
	p.failCount++
	if p.failCount >= maxFailCount {
		delete(pm.peers, id)
		return true
	}
	return false
}

// ResetFailures resets a peer's failure counter to zero.
func (pm *PeerMap) ResetFailures(id string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	if p, ok := pm.peers[id]; ok {
		p.failCount = 0
	}
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

// Remove deletes a peer by ID.
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

// Stop is a no-op kept for interface compatibility.  No background
// goroutines to shut down.
func (pm *PeerMap) Stop() {}
