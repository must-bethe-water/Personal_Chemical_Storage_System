#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/../.." && pwd)"
version="$(cd "$project_root" && node -p "require('./package.json').version")"

cd "$project_root"
release_work="$(mktemp -d /private/tmp/pcss-release.XXXXXX)"
trap 'rm -rf "$release_work"' EXIT
PCSS_OUTPUT_DIR="$release_work" \
PCSS_SIGN_IDENTITY="-" \
PCSS_BUILD_NUMBER="${PCSS_BUILD_NUMBER:-1}" \
PCSS_REPOSITORY_URL="${PCSS_REPOSITORY_URL:-}" \
npm run desktop:build
PCSS_APP_PATH="$release_work/PCSS.app" PCSS_REQUIRE_AD_HOC_SIGNATURE=1 npm run release:verify

mkdir -p "$project_root/outputs"
app="$release_work/PCSS.app"
release_zip="$project_root/outputs/PCSS-$version-macOS-universal-unnotarized.zip"
dmg="$project_root/outputs/PCSS-$version-macOS-universal-unnotarized.dmg"
dmg_work="$release_work/PCSS-$version-macOS-universal-unnotarized.dmg"
checksums="$project_root/outputs/SHA256SUMS.txt"
dmg_root="$release_work/dmg-root"

rm -f "$release_zip" "$dmg" "$checksums"
ditto -c -k --keepParent "$app" "$release_zip"
unzip -tq "$release_zip"

mkdir -p "$dmg_root"
ditto --noextattr --noqtn "$app" "$dmg_root/PCSS.app"
ln -s /Applications "$dmg_root/Applications"
hdiutil create -volname "PCSS $version" -srcfolder "$dmg_root" -ov -format UDZO "$dmg_work"
hdiutil verify "$dmg_work" >/dev/null
ditto --noextattr --noqtn "$dmg_work" "$dmg"

(cd "$project_root/outputs" && shasum -a 256 "$(basename "$release_zip")" "$(basename "$dmg")") > "$checksums"
echo "WARNING: These artifacts are ad-hoc signed and not notarized by Apple."
echo "Release artifacts:"
echo "$release_zip"
echo "$dmg"
echo "$checksums"
