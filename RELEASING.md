# Releasing PCSS

## Version policy

PCSS uses Semantic Versioning. The version in `package.json`, `package-lock.json`,
the changelog heading, and the Git tag must agree. `Info.plist` is populated
from `package.json` during the build. GitHub Actions uses its run number as the
monotonically increasing macOS build number.

## Local release prerequisites

1. Apple Developer Program membership.
2. A Developer ID Application certificate installed in the login Keychain.
3. A `notarytool` profile created without placing credentials in the repository:

   ```bash
   xcrun notarytool store-credentials PCSS_RELEASE \
     --apple-id "APPLE_ID" \
     --team-id "TEAM_ID" \
     --password "APP_SPECIFIC_PASSWORD"
   ```

4. A clean checkout and successful test suite.

Run:

```bash
PCSS_SIGN_IDENTITY="Developer ID Application: …" \
PCSS_NOTARY_PROFILE="PCSS_RELEASE" \
PCSS_BUILD_NUMBER="1" \
PCSS_REPOSITORY_URL="https://github.com/must-bethe-water/Personal_Chemical_Storage_System" \
npm run release:macos
```

The script builds a Universal app in a private temporary directory, enables
Hardened Runtime, verifies signing, submits the app and DMG for notarization,
staples and validates tickets, runs Gatekeeper assessment, and creates:

- `PCSS-VERSION-macOS-universal.dmg`
- `PCSS-VERSION-macOS-universal.zip`
- `SHA256SUMS.txt`

## GitHub Actions secrets

The release workflow requires:

- `MACOS_CERTIFICATE_P12_BASE64`
- `MACOS_CERTIFICATE_PASSWORD`
- `MACOS_KEYCHAIN_PASSWORD`
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

The workflow runs only for a `v*` tag, verifies that the tag equals the package
version, runs all tests, imports the certificate into an ephemeral Keychain,
signs and notarizes the app, and creates the GitHub Release. Repository URL
metadata is derived automatically from the GitHub environment.

## Release checklist

- [ ] Working tree contains only intended source changes
- [ ] `npm ci && npm test && npm run build && npm run release:verify` passes
- [ ] `CHANGELOG.md` contains the release date and user-visible changes
- [ ] Data migrations are backward compatible and tested
- [ ] Privacy, third-party service, and disclaimer text is current
- [ ] Version has been tested on a clean macOS user account
- [ ] Online, offline, reconnect, import, export, and restore smoke tests pass
- [ ] Tag is signed if the maintainer's Git policy requires it
- [ ] Release assets pass Gatekeeper and checksum verification after download
