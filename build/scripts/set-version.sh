#!/usr/bin/env sh
# Stamp a release version into every file that ships it.
#
#   build/scripts/set-version.sh 0.12.0      # or v0.12.0
#
# The release workflow runs this on every v* tag before building, so the binary,
# .deb, .app, .exe and NSIS installer all report the same version. Running it
# twice with the same version is a no-op.

set -eu

[ $# -eq 1 ] || {
  echo "usage: $0 <version>   (e.g. 0.12.0)" >&2
  exit 2
}

VERSION="${1#v}"

printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
  echo "error: '$VERSION' is not an x.y.z version" >&2
  exit 2
}

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT"

# stamp FILE SED-SCRIPT EXPECTED-TEXT
# Rewrites FILE with the sed script, then checks EXPECTED-TEXT is present so a
# drifted pattern fails here instead of shipping a stale version.
stamp() {
  file=$1
  script=$2
  expected=$3

  [ -f "$file" ] || {
    echo "error: missing $file" >&2
    exit 1
  }

  tmp="$file.stamp.$$"
  sed -E "$script" "$file" > "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"

  grep -qF -- "$expected" "$file" || {
    echo "error: $file was not stamped with '$expected'" >&2
    exit 1
  }
}

# Go fallback. CI builds also inject -X main.AppVersion (see the Taskfiles), so
# this value only matters for plain `go run`/`go build`.
stamp main.go \
  's|^var AppVersion = ".*"|var AppVersion = "v'"$VERSION"'"|' \
  "var AppVersion = \"v$VERSION\""

# Wails project metadata (Windows .syso and installer defaults derive from it).
stamp build/config.yml \
  's|^(  version: ")[^"]*(")|\1v'"$VERSION"'\2|' \
  "version: \"v$VERSION\""

# Linux .deb metadata.
stamp build/linux/nfpm/nfpm.yaml \
  's|^(version: ")[^"]*(")|\1'"$VERSION"'\2|' \
  "version: \"$VERSION\""

# macOS bundle metadata.
for plist in build/darwin/Info.plist build/darwin/Info.dev.plist; do
  for key in CFBundleVersion CFBundleShortVersionString; do
    stamp "$plist" \
      '/<key>'"$key"'<\/key>/{n;s|<string>[^<]*</string>|<string>'"$VERSION"'</string>|;}' \
      "<string>$VERSION</string>"
  done
done

# Windows executable resource (read by `wails3 generate syso`).
stamp build/windows/info.json \
  's|("ProductVersion": ")[^"]*(")|\1'"$VERSION"'\2|' \
  "\"ProductVersion\": \"$VERSION\""

stamp build/windows/info.json \
  's|("file_version": ")[^"]*(")|\1'"$VERSION"'\2|' \
  "\"file_version\": \"$VERSION\""

# Only the application assembly identity carries the version - the
# Common-Controls dependency below it must keep its own.
stamp build/windows/wails.exe.manifest \
  's|(<assemblyIdentity type="win32" name="com\.wails\.[^"]*" version=")[^"]*(")|\1'"$VERSION"'.0\2|' \
  "version=\"$VERSION.0\""

# NSIS installer defaults (project.nsi reads these).
stamp build/windows/installer/wails_tools.nsh \
  's|^([[:space:]]*!define INFO_PRODUCTVERSION ")[^"]*(")|\1'"$VERSION"'\2|' \
  "!define INFO_PRODUCTVERSION \"$VERSION\""

# Legacy Wails project file, still read by some tooling.
stamp wails.json \
  's|("productVersion": ")[^"]*(")|\1'"$VERSION"'\2|' \
  "\"productVersion\": \"$VERSION\""

echo "Stamped version $VERSION (tag v$VERSION) into main.go, build/config.yml, nfpm, both Info.plists, windows/info.json, the manifest, wails_tools.nsh and wails.json."
