#!/bin/sh
# Runs after the .deb is unpacked. Without this, some desktops keep a cached
# application list and Clipcat does not show up in the menu until logout.

set -e

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q /usr/share/applications || true
fi

if command -v update-mime-database >/dev/null 2>&1; then
  update-mime-database /usr/share/mime || true
fi

exit 0
