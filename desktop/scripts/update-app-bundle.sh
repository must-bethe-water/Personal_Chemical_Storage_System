#!/usr/bin/env bash
# Replace a verified bundle's contents without invalidating Finder/Dock bookmarks.
set -euo pipefail
source_app="${1:?Source app required}"
target_app="${2:?Target app required}"

source_identifier="$(plutil -extract CFBundleIdentifier raw -o - "$source_app/Contents/Info.plist")"
if [[ -L "$target_app" || ( -e "$target_app" && ! -d "$target_app" ) ]]; then
  echo "Refusing to update a symlink or non-directory: $target_app" >&2
  exit 1
fi
if [[ -d "$target_app" ]]; then
  target_identifier="$(plutil -extract CFBundleIdentifier raw -o - "$target_app/Contents/Info.plist")"
  if [[ "$target_identifier" != "$source_identifier" ]]; then
    echo "Refusing to replace a different application: $target_app" >&2
    exit 1
  fi
fi
mkdir -p "$(dirname "$target_app")"
update_dir="$(mktemp -d "$(dirname "$target_app")/.pcss-update.XXXXXX")"
had_previous=0
installed=0
committed=0
cleanup() {
  if [[ "$committed" == 0 ]]; then
    if [[ "$installed" == 1 ]]; then rm -rf "$target_app/Contents"; fi
    if [[ "$had_previous" == 1 ]]; then mv "$update_dir/PreviousContents" "$target_app/Contents"; fi
  fi
  rm -rf "$update_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Stage the copy on the target volume before touching the existing bundle.
ditto --noextattr --noqtn "$source_app" "$update_dir/Next.app"
xattr -cr "$update_dir/Next.app"
codesign --verify --deep --strict "$update_dir/Next.app"
mkdir -p "$target_app"
if [[ -d "$target_app/Contents" ]]; then
  mv "$target_app/Contents" "$update_dir/PreviousContents"
  had_previous=1
fi
mv "$update_dir/Next.app/Contents" "$target_app/Contents"
installed=1
# Finder can attach bundle-root metadata; keep its inode but remove signing detritus.
xattr -d com.apple.FinderInfo "$target_app" 2>/dev/null || true
xattr -d com.apple.ResourceFork "$target_app" 2>/dev/null || true
xattr -d 'com.apple.fileprovider.fpfs#P' "$target_app" 2>/dev/null || true
codesign --verify --deep --strict "$target_app"
committed=1
