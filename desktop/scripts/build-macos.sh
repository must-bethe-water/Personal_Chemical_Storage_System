#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/../.." && pwd)"
outputs_dir="${PCSS_OUTPUT_DIR:-$project_root/outputs}"
output_app="$outputs_dir/PCSS.app"
bundle_identifier="io.github.must-bethe-water.pcss"
bundle_identifier="${PCSS_BUNDLE_IDENTIFIER:-$bundle_identifier}"
sign_identity="${PCSS_SIGN_IDENTITY:--}"
build_number="${PCSS_BUILD_NUMBER:-1}"
app_version="$(node -p "require('./package.json').version")"
repository_url="${PCSS_REPOSITORY_URL:-}"
staging_dir="$(mktemp -d /private/tmp/pcss-build.XXXXXX)"
app_root="$staging_dir/PCSS.app"
contents="$app_root/Contents"
macos_dir="$contents/MacOS"
resources_dir="$contents/Resources"
build_dir="$project_root/desktop/.native-build"

cleanup() {
  rm -rf "$staging_dir" "$build_dir" "$project_root/desktop/.ui-build"
}

cleanup_numbered_copies() {
  [[ -d "$outputs_dir" ]] || return 0
  while IFS= read -r -d '' candidate; do
    candidate_identifier="$(plutil -extract CFBundleIdentifier raw -o - "$candidate/Contents/Info.plist" 2>/dev/null || true)"
    if [[ "$candidate_identifier" == "$bundle_identifier" ]]; then
      rm -rf "$candidate"
    fi
  done < <(find "$outputs_dir" -maxdepth 1 -type d -name 'PCSS [0-9]*.app' -print0)
}

trap cleanup EXIT

cd "$project_root"
cleanup_numbered_copies
npm run desktop:bundle:ui

rm -rf "$build_dir"
mkdir -p "$macos_dir" "$resources_dir/UI" "$build_dir"
cp -R "$project_root/desktop/.ui-build/." "$resources_dir/UI/"
mkdir -p "$resources_dir/Legal"
cp "$project_root/LICENSE" "$project_root/PRIVACY.md" "$project_root/DISCLAIMER.md" "$project_root/THIRD_PARTY_NOTICES.md" "$resources_dir/Legal/"

arch_flags=()
for architecture in ${PCSS_ARCHS:-arm64 x86_64}; do
  arch_flags+=( -arch "$architecture" )
done

MACOSX_DEPLOYMENT_TARGET=13.0 clang \
  "${arch_flags[@]}" \
  -fobjc-arc \
  -O2 \
  -framework AppKit \
  -framework Foundation \
  -framework Security \
  -framework WebKit \
  -lsqlite3 \
  "$project_root/desktop/native/PCSSStore.m" \
  "$project_root/desktop/native/main.m" \
  -o "$macos_dir/PCSS"

cp "$project_root/desktop/native/Info.plist" "$contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$bundle_identifier" "$contents/Info.plist"
plutil -replace CFBundleShortVersionString -string "$app_version" "$contents/Info.plist"
plutil -replace CFBundleVersion -string "$build_number" "$contents/Info.plist"
plutil -replace PCSSRepositoryURL -string "$repository_url" "$contents/Info.plist"

iconset="$build_dir/AppIcon.iconset"
mkdir -p "$iconset"
node "$project_root/desktop/scripts/generate-icon.mjs" "$build_dir/icon-1024.png"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$build_dir/icon-1024.png" --out "$iconset/icon_${size}x${size}.png" >/dev/null
  double_size=$((size * 2))
  sips -z "$double_size" "$double_size" "$build_dir/icon-1024.png" --out "$iconset/icon_${size}x${size}@2x.png" >/dev/null
done
node "$project_root/desktop/scripts/pack-icns.mjs" "$iconset" "$resources_dir/AppIcon.icns"

xattr -cr "$app_root"
xattr -d com.apple.FinderInfo "$app_root" 2>/dev/null || true
xattr -d 'com.apple.fileprovider.fpfs#P' "$app_root" 2>/dev/null || true
codesign_args=(--force --sign "$sign_identity")
if [[ "$sign_identity" != "-" ]]; then
  codesign_args+=(--options runtime --timestamp)
fi
codesign "${codesign_args[@]}" "$app_root" >/dev/null
codesign --verify --deep --strict "$app_root"
mkdir -p "$outputs_dir"
rm -rf "$output_app"
ditto --noextattr --noqtn "$app_root" "$output_app"
codesign --verify --deep --strict "$output_app"
cleanup_numbered_copies

echo "$output_app"
