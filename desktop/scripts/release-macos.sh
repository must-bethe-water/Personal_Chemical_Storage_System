#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/../.." && pwd)"
version="$(cd "$project_root" && node -p "require('./package.json').version")"
: "${PCSS_SIGN_IDENTITY:?Set PCSS_SIGN_IDENTITY to a Developer ID Application identity}"
: "${PCSS_NOTARY_PROFILE:?Set PCSS_NOTARY_PROFILE to a notarytool Keychain profile}"

cd "$project_root"
release_work="$(mktemp -d /private/tmp/pcss-release.XXXXXX)"
trap 'rm -rf "$release_work"' EXIT
PCSS_OUTPUT_DIR="$release_work" PCSS_SIGN_IDENTITY="$PCSS_SIGN_IDENTITY" PCSS_BUILD_NUMBER="${PCSS_BUILD_NUMBER:-1}" npm run desktop:build
PCSS_APP_PATH="$release_work/PCSS.app" PCSS_REQUIRE_DISTRIBUTION_SIGNATURE=1 npm run release:verify

mkdir -p "$project_root/outputs"
app="$release_work/PCSS.app"
submission_zip="$release_work/PCSS-$version-notary.zip"
release_zip="$project_root/outputs/PCSS-$version-macOS-universal.zip"
dmg_work="$release_work/PCSS-$version-macOS-universal.dmg"
dmg="$project_root/outputs/PCSS-$version-macOS-universal.dmg"
checksums="$project_root/outputs/SHA256SUMS.txt"

ditto -c -k --keepParent "$app" "$submission_zip"
xcrun notarytool submit "$submission_zip" --keychain-profile "$PCSS_NOTARY_PROFILE" --wait
xcrun stapler staple "$app"
xcrun stapler validate "$app"
spctl --assess --type execute --verbose=2 "$app"

ditto -c -k --keepParent "$app" "$release_zip"
hdiutil create -volname "PCSS $version" -srcfolder "$app" -ov -format UDZO "$dmg_work"
xcrun notarytool submit "$dmg_work" --keychain-profile "$PCSS_NOTARY_PROFILE" --wait
xcrun stapler staple "$dmg_work"
xcrun stapler validate "$dmg_work"
ditto --noextattr --noqtn "$dmg_work" "$dmg"

(cd "$project_root/outputs" && shasum -a 256 "$(basename "$release_zip")" "$(basename "$dmg")") > "$checksums"
echo "Release artifacts:"
echo "$release_zip"
echo "$dmg"
echo "$checksums"
