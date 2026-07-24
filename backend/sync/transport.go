package sync

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"net"
	"time"
)

const (
	// Port is the TCP port used for clipboard sync traffic.
	Port = 47821

	// maxPayloadSize is the maximum allowed payload in bytes (25 MB).
	maxPayloadSize = 25 * 1024 * 1024

	// sendTimeout is the timeout for a single Send operation (LAN, should
	// complete in <1s even for 25MB; 5s is generous).
	sendTimeout = 5 * time.Second
)

// Send dials a peer and sends a length-prefixed payload.  The wire format is:
//
//	[4 bytes big-endian uint32 payload length][payload bytes]
//
// The payload is expected to already be encrypted.  The connection is closed
// after the write completes.  Failed sends are logged and return an error.
func Send(ctx context.Context, addr string, payload []byte) error {
	if len(payload) > maxPayloadSize {
		return fmt.Errorf("sync send: payload too large (%d > %d)", len(payload), maxPayloadSize)
	}

	dialer := &net.Dialer{}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return fmt.Errorf("sync send dial %s: %w", addr, err)
	}
	defer conn.Close()

	// Apply a write deadline relative to ctx deadline.
	if deadline, ok := ctx.Deadline(); ok {
		conn.SetWriteDeadline(deadline)
	} else {
		conn.SetWriteDeadline(time.Now().Add(sendTimeout))
	}

	// Write length prefix.
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))
	if _, err := conn.Write(header); err != nil {
		return fmt.Errorf("sync send header to %s: %w", addr, err)
	}

	// Write payload.
	if _, err := conn.Write(payload); err != nil {
		return fmt.Errorf("sync send payload to %s: %w", addr, err)
	}

	return nil
}

// Listen starts a TCP listener on the given port and pushes incoming
// payloads (raw bytes, still encrypted) onto the incoming channel.
// The listener runs until ctx is cancelled.  Each connection is handled
// in a short-lived goroutine that reads one payload and closes.
func Listen(ctx context.Context, port int, incoming chan<- []byte) error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return fmt.Errorf("sync listen: %w", err)
	}

	// Shutdown the listener when ctx is cancelled.
	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			// If the context was cancelled, shut down cleanly.
			if ctx.Err() != nil {
				return nil
			}
			log.Printf("[sync] accept error: %v", err)
			continue
		}

		go handleConnection(conn, incoming)
	}
}

// handleConnection reads a single length-prefixed payload from a client
// connection and pushes it onto the incoming channel.
func handleConnection(conn net.Conn, incoming chan<- []byte) {
	defer conn.Close()

	// Set a read deadline so slow clients don't hold us up.
	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	// Read 4-byte length prefix.
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		// EOF is expected - it's the heartbeat closing the connection
		// or a keepalive probe.  No need to log it.
		if err != io.EOF {
			log.Printf("[sync] read header: %v", err)
		}
		return
	}

	payloadLen := binary.BigEndian.Uint32(header)
	if payloadLen > maxPayloadSize {
		log.Printf("[sync] payload too large: %d", payloadLen)
		return
	}

	// Read the payload.
	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(conn, payload); err != nil {
		log.Printf("[sync] read payload: %v", err)
		return
	}

	// Push to incoming channel (non-blocking with ctx via the caller).
	select {
	case incoming <- payload:
	default:
		log.Printf("[sync] dropped incoming payload (channel full)")
	}
}
