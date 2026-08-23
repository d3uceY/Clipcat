# Vendored native dependencies

## `llama-go/` — llama.cpp bindings (CGO)

This is a vendored copy of `github.com/tcpipuk/llama-go` with the llama.cpp
static archives prebuilt for **Windows/amd64 (MinGW-w64)**. The Go module
`Clipcat` wires it in with a `replace` directive:

```
replace github.com/tcpipuk/llama-go => ./third_party/llama-go
```

The static libs (`libbinding.a`, `libllama.a`, `libllama-common*.a`,
`libggml*.a`) are **platform-specific** and must be rebuilt on each OS that
needs a Clipcat build. The Go source, `cgo_headers/`, and the `llama.cpp/`
header shim here are platform-independent.

### Rebuilding the native libs per OS

The pipeline (compile `wrapper.cpp`, bundle into `libbinding.a`, copy the
llama.cpp archives into the `llama-go/` root) is the non-obvious part. It is
documented in the **llama-go-windows** Copilot skill (`reference/build.ps1`
automates Windows). High level:

- **Windows** — MinGW-w64 (WinLibs) on `PATH`; CMake + Ninja build of
  llama.cpp, then assemble `libbinding.a` + copy `lib*.a` into the root. The
  llama.cpp source is needed for this step (clone it, or use the skill's
  pinned build).
- **Linux** — gcc + CMake + Ninja. No MinGW patch needed (coreutils exist),
  but the archives still need the `lib` prefix and `libbinding.a` bundle.
- **macOS** — clang/Xcode + CMake; link with the darwin LDFLAGS in
  `linkage_static.go` (Metal/Accelerate, no libgomp).

### Runtime DLLs (Windows only)

A CPU-only llama.cpp build pulls in 5 MinGW runtime DLLs that must sit beside
the exe:

```
libdl.dll, libgcc_s_seh-1.dll, libgomp-1.dll, libstdc++-6.dll, libwinpthread-1.dll
```

`libdl.dll` is the one that causes `0xC0000135` at launch if missing.
