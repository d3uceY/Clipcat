module Clipcat

go 1.26.5

require (
	github.com/grandcat/zeroconf v1.0.0
	github.com/lxn/win v0.0.0-20210218163916-a377121e959e
	github.com/tcpipuk/llama-go v0.0.0-00010101000000-000000000000
	github.com/wailsapp/wails/v3 v3.0.0-alpha2.117
	golang.design/x/clipboard v0.7.1
	golang.org/x/crypto v0.51.0
	golang.org/x/image v0.40.0
	modernc.org/sqlite v1.56.0
)

// llama-go (llama.cpp bindings) is vendored so the prebuilt native static
// archives ship with the repo. Rebuild them per-OS: see the llama-go-windows
// skill / third_party/llama-go/README for the native build steps.
replace github.com/tcpipuk/llama-go => ./third_party/llama-go

require (
	git.sr.ht/~jackmordaunt/go-toast/v2 v2.0.3 // indirect
	github.com/adrg/xdg v0.5.3 // indirect
	github.com/cenkalti/backoff v2.2.1+incompatible // indirect
	github.com/coder/websocket v1.8.14 // indirect
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/go-ole/go-ole v1.3.0 // indirect
	github.com/godbus/dbus/v5 v5.2.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect
	github.com/mattn/go-colorable v0.1.14 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/miekg/dns v1.1.27 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/exp/shiny v0.0.0-20250606033433-dcc06ee1d476 // indirect
	golang.org/x/mobile v0.0.0-20250606033058-a2a15c67f36f // indirect
	golang.org/x/net v0.54.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	modernc.org/libc v1.74.4 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
)
