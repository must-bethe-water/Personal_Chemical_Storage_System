#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/../.." && pwd)"
source_app="${PCSS_APP_PATH:-$project_root/outputs/PCSS.app}"
expected_version="$(cd "$project_root" && node -p "require('./package.json').version")"

[[ -d "$source_app" ]] || { echo "Missing PCSS.app at $source_app" >&2; exit 1; }
verify_dir="$(mktemp -d /private/tmp/pcss-release-verify.XXXXXX)"
trap 'rm -rf "$verify_dir"' EXIT
app="$verify_dir/PCSS.app"
ditto --noextattr --noqtn "$source_app" "$app"
xattr -cr "$app"
actual_version="$(plutil -extract CFBundleShortVersionString raw -o - "$app/Contents/Info.plist")"
[[ "$actual_version" == "$expected_version" ]] || { echo "Version mismatch: $actual_version != $expected_version" >&2; exit 1; }

binary="$app/Contents/MacOS/PCSS"
architectures="$(lipo -archs "$binary")"
[[ " $architectures " == *" arm64 "* && " $architectures " == *" x86_64 "* ]] || { echo "PCSS is not universal: $architectures" >&2; exit 1; }

codesign --verify --deep --strict "$app"
if [[ "${PCSS_REQUIRE_DISTRIBUTION_SIGNATURE:-0}" == "1" ]]; then
  signature_details="$(codesign -d --verbose=4 "$app" 2>&1)"
  [[ "$signature_details" == *"Authority=Developer ID Application:"* ]] || { echo "Missing Developer ID Application signature" >&2; exit 1; }
  [[ "$signature_details" == *"runtime"* ]] || { echo "Hardened Runtime is not enabled" >&2; exit 1; }
fi
for required in LICENSE PRIVACY.md SECURITY.md DISCLAIMER.md THIRD_PARTY_NOTICES.md CHANGELOG.md; do
  [[ -f "$project_root/$required" ]] || { echo "Missing $required" >&2; exit 1; }
done
for bundled in LICENSE PRIVACY.md DISCLAIMER.md THIRD_PARTY_NOTICES.md; do
  [[ -f "$app/Contents/Resources/Legal/$bundled" ]] || { echo "App bundle is missing Legal/$bundled" >&2; exit 1; }
done
grep -Fq "## [$expected_version]" "$project_root/CHANGELOG.md" || { echo "CHANGELOG has no $expected_version entry" >&2; exit 1; }
echo "Verified PCSS $actual_version ($architectures)"
