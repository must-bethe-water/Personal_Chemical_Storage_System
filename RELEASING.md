# Releasing PCSS

## Version policy

PCSS uses Semantic Versioning. The version in `package.json`, `package-lock.json`,
the changelog heading, and the Git tag must agree. `Info.plist` is populated
from `package.json` during the build. GitHub Actions uses its run number as the
monotonically increasing macOS build number.

## Distribution model

PCSS releases are distributed on GitHub without Apple Developer Program
membership. The app is ad-hoc signed so macOS can verify bundle consistency,
but it is not notarized and does not carry a verified developer identity.
Release filenames and notes state this limitation explicitly. Users must follow
[INSTALL.md](INSTALL.md) to approve the first launch in Privacy & Security.

## Local release prerequisites

1. macOS 13 or later with Xcode Command Line Tools.
2. Node.js 22.13 or later.
3. A clean checkout and successful test suite.

Run:

```bash
PCSS_BUILD_NUMBER="1" \
PCSS_REPOSITORY_URL="https://github.com/must-bethe-water/Personal_Chemical_Storage_System" \
npm run release:macos
```

The script builds a Universal app in a private temporary directory, applies and
verifies an ad-hoc signature, packages the app, verifies both archives, and
creates:

- `PCSS-VERSION-macOS-universal-unnotarized.dmg`
- `PCSS-VERSION-macOS-universal-unnotarized.zip`
- `SHA256SUMS.txt`

## GitHub Actions release

The workflow needs no Apple certificate or account secret. It runs only for a
`v*` tag, verifies that the tag equals the package version, runs all tests,
builds and verifies the ad-hoc-signed app, and creates a GitHub Release whose
notes are the unnotarized installation warning in `INSTALL.md`. Repository URL
metadata is derived automatically from the GitHub environment.

## Release checklist

- [ ] Working tree contains only intended source changes
- [ ] `npm ci && npm test && npm run build && npm run release:verify` passes
- [ ] `CHANGELOG.md` contains the release date and user-visible changes
- [ ] Data migrations are backward compatible and tested
- [ ] Privacy, third-party service, and disclaimer text is current
- [ ] Version has been tested on a clean macOS user account
- [ ] Online, offline, reconnect, import, export, and restore smoke tests pass
- [ ] The release title, notes, ZIP, and DMG all clearly say `unnotarized`
- [ ] SHA-256 verification succeeds after downloading the public assets
- [ ] A clean Mac blocks the first launch and the documented Open Anyway flow works
