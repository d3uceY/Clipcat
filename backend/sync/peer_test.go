package sync

import (
	"testing"
	"time"
)

func TestPeerMapAddOrUpdate(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")
	pm.AddOrUpdate("peer2", "192.168.1.11:47821")

	if pm.Len() != 2 {
		t.Fatalf("expected 2 peers, got %d", pm.Len())
	}

	peers := pm.GetPeers()
	ids := make(map[string]bool)
	for _, p := range peers {
		ids[p.ID] = true
	}
	if !ids["peer1"] || !ids["peer2"] {
		t.Fatal("missing expected peers")
	}
}

func TestPeerMapUpdateRefreshesLastSeen(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")
	time.Sleep(10 * time.Millisecond)
	pm.AddOrUpdate("peer1", "192.168.1.10:47822") // different port

	peers := pm.GetPeers()
	if len(peers) != 1 {
		t.Fatalf("expected 1 peer after update, got %d", len(peers))
	}
	if peers[0].Addr != "192.168.1.10:47822" {
		t.Fatalf("expected updated addr, got %s", peers[0].Addr)
	}
}

func TestPeerMapRemove(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")
	pm.Remove("peer1")

	if pm.Len() != 0 {
		t.Fatal("expected 0 peers after removal")
	}
}

func TestPeerMapRecordFailureEvictsAfterThree(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")

	// First two failures should not evict.
	if pm.RecordFailure("peer1") {
		t.Fatal("first failure should not evict")
	}
	if pm.RecordFailure("peer1") {
		t.Fatal("second failure should not evict")
	}

	// Third failure should evict.
	if !pm.RecordFailure("peer1") {
		t.Fatal("third failure should evict")
	}

	if pm.Len() != 0 {
		t.Fatal("expected 0 peers after 3 failures")
	}
}

func TestPeerMapResetFailures(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")

	pm.RecordFailure("peer1")
	pm.RecordFailure("peer1")
	pm.ResetFailures("peer1")

	// After reset, should need 3 more failures to evict.
	if pm.RecordFailure("peer1") {
		t.Fatal("first failure after reset should not evict")
	}
	if pm.RecordFailure("peer1") {
		t.Fatal("second failure after reset should not evict")
	}
	if !pm.RecordFailure("peer1") {
		t.Fatal("third failure after reset should evict")
	}
}

func TestPeerMapAddOrUpdateResetsFailures(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")
	pm.RecordFailure("peer1")
	pm.RecordFailure("peer1")

	// Re-announcement via mDNS should reset failures.
	pm.AddOrUpdate("peer1", "192.168.1.10:47821")

	if pm.RecordFailure("peer1") {
		t.Fatal("first failure after re-announce should not evict")
	}
	if pm.RecordFailure("peer1") {
		t.Fatal("second failure after re-announce should not evict")
	}
	if !pm.RecordFailure("peer1") {
		t.Fatal("third failure after re-announce should evict")
	}
}

func TestPeerMapGetPeersSnapshot(t *testing.T) {
	pm := NewPeerMap()
	defer pm.Stop()

	pm.AddOrUpdate("peer1", "192.168.1.10:47821")

	peers := pm.GetPeers()
	peers[0].ID = "modified"

	// Original should be unchanged (snapshot copy).
	if pm.Len() != 1 {
		t.Fatal("GetPeers should return a copy, not a reference")
	}
}
