#!/usr/bin/env bash
#
# angel — one-line installer for mac. removes the gatekeeper friction
# of an unsigned alpha build by clearing the quarantine bit after copy.
#
# usage:
#   curl -sSL https://angel.stephenhung.me/install.sh | bash
#
# what it does:
#   1. downloads the latest .dmg from github releases (arm64 only)
#   2. mounts the disk image with hdiutil
#   3. copies Angel.app into /Applications (replacing any existing copy)
#   4. removes the com.apple.quarantine xattr so first-launch doesn't bounce
#   5. ejects the dmg + cleans up
#   6. opens the app
#
# tested on macOS 14+ apple silicon. intel mac + windows builds coming soon.

set -euo pipefail

DMG_URL="https://github.com/stephenhungg/angel/releases/download/v0.0.2-alpha/Angel-0.0.2-arm64.dmg"
TMP_DMG="/tmp/angel-install-$$.dmg"
MOUNT_POINT="/Volumes/Angel"
APP_PATH="/Applications/Angel.app"

pink()  { printf '\033[38;5;205m%s\033[0m\n' "$1"; }
dim()   { printf '\033[2m%s\033[0m\n'        "$1"; }
green() { printf '\033[32m%s\033[0m\n'       "$1"; }
red()   { printf '\033[31m%s\033[0m\n'       "$1" >&2; }

cleanup() {
  if mount | grep -q "$MOUNT_POINT"; then
    hdiutil detach "$MOUNT_POINT" -quiet || true
  fi
  rm -f "$TMP_DMG"
}
trap cleanup EXIT

# --- preflight ---
if [[ "$(uname -s)" != "Darwin" ]]; then
  red "angel desktop is mac-only for now. windows/linux: coming soon."
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  red "angel is apple silicon only for now. intel mac build: coming soon."
  red "if you really want to try, grab the dmg from"
  red "  https://github.com/stephenhungg/angel/releases"
  exit 1
fi

pink "★ summoning angel..."
echo

# --- 1. download ---
dim "  ↓ downloading dmg (~110MB)..."
curl -L --fail --progress-bar "$DMG_URL" -o "$TMP_DMG"

# --- 2. mount ---
dim "  ◇ mounting disk image..."
hdiutil attach "$TMP_DMG" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

# --- 3. copy (replace existing) ---
if [[ -d "$APP_PATH" ]]; then
  dim "  ⌫ removing existing /Applications/Angel.app..."
  rm -rf "$APP_PATH"
fi

dim "  → copying to /Applications..."
cp -R "$MOUNT_POINT/Angel.app" "/Applications/"

# --- 4. clear quarantine (the whole reason this script exists) ---
dim "  ✓ clearing gatekeeper quarantine..."
xattr -cr "$APP_PATH" 2>/dev/null || true

# --- 5. unmount + cleanup (handled by trap) ---
dim "  ↑ unmounting dmg..."
hdiutil detach "$MOUNT_POINT" -quiet
rm -f "$TMP_DMG"
trap - EXIT  # already cleaned up

# --- 6. launch ---
echo
green "✓ angel installed to $APP_PATH"
echo
pink "  she's waking up..."
open "$APP_PATH"

echo
dim "  next: head to https://angel.stephenhung.me/swipe to discover her."
echo
