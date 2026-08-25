# PCSS for macOS

PCSS (Personal Chemical Storage System) is a local-first, open-source personal
chemical inventory for macOS. It tracks identity, quantity, location, tags,
database identifiers, and two-dimensional structures without requiring an
account or a PCSS-operated server.

> PCSS is an inventory aid, not a safety data sheet, regulatory compliance, or
> authoritative chemical identity system. Verify all safety-critical data from
> current primary sources. See [DISCLAIMER.md](DISCLAIMER.md).

## Features

- English and Chinese interface
- Search, field filters, tag filters, sorting, and duplicate-CAS review
- Local SQLite inventory with transactional writes and rotating backups
- JSON and CSV import/export with merge or replace workflows
- Offline browsing, editing, deletion, filtering, and cached structure images
- On-demand PubChem properties and structures
- UniChem mapping to ChEBI and ChEMBL
- Optional EPA CompTox lookup with the user's API key stored in macOS Keychain
- Native AppKit/WebKit shell without a bundled Chromium runtime

## Privacy and offline behavior

Inventory data stays under `~/Library/Application Support/PCSS/`. PCSS has no
analytics, telemetry, advertising, or account system. Online lookups send only
the required chemical identifier to the relevant public database; quantities,
locations, and tags are not sent. See [PRIVACY.md](PRIVACY.md) for the exact
data flow.

Without a network connection, all local inventory functions remain available.
New database enrichment and uncached images wait until connectivity returns.

## Install a published release

Published GitHub Releases contain an ad-hoc-signed, **unnotarized** Universal
macOS DMG and ZIP for Apple Silicon and Intel Macs, plus SHA-256 checksums.
Because the project does not use the paid Apple Developer Program, macOS blocks
the first ordinary launch and does not show a verified developer identity.

1. Download the DMG from the latest Release.
2. Verify its SHA-256 value against `SHA256SUMS.txt` if desired.
3. Open the DMG and copy PCSS to Applications.
4. Try to launch PCSS once, then use **System Settings → Privacy & Security →
   Open Anyway** and confirm the override.

Read [INSTALL.md](INSTALL.md) before overriding Gatekeeper. Only download from
the official repository and never bypass a warning for an unexpected copy.

Release builds support macOS 13 or later. Use **PCSS → Check for Updates…** to
open the latest release page. PCSS never downloads or installs updates without
the user.

## Build from source

Requirements:

- macOS 13 or later
- Node.js 22.13 or later
- Xcode Command Line Tools

```bash
npm ci
npm test
npm run build
npm run release:verify
```

The ad-hoc-signed Universal development app is written to `outputs/PCSS.app`.
There is no standalone browser target or development server; the React UI is
compiled only as an internal application resource.

## Local data and migration

- SQLite database: `~/Library/Application Support/PCSS/inventory.sqlite3`
- Cached structures: `~/Library/Application Support/PCSS/StructureCache/`
- Last 20 inventory snapshots: `~/Library/Application Support/PCSS/Backups/`
- Optional CompTox key: macOS Keychain

The first launch transactionally migrates the earlier
`pcss-chemicals-v1` WebKit local-storage format. The legacy value is removed
only after SQLite confirms the write. Interface language remains in WebKit's
local preference store.

Use **Database settings → Data & Backup** to export JSON or CSV and to import a
file. JSON is the lossless backup format; CSV is intended for review and
interchange.

## Project structure

- `desktop/ui/`: React interface and UI model helpers
- `desktop/native/`: AppKit/WebKit shell, SQLite store, Keychain and API bridge
- `desktop/scripts/`: deterministic build, test, verification, and release tools
- `tests/`: UI model tests
- `.github/`: CI, unnotarized release workflow, Dependabot, and contribution forms

## Verification

`npm test` runs linting, strict TypeScript checking, UI model tests, native
SQLite/import/export/cache tests, and a production UI build. CI additionally
builds and verifies a Universal app.

## Maintaining releases

See [RELEASING.md](RELEASING.md). A public tag release is built entirely by
GitHub Actions with an ad-hoc signature and requires no Apple credentials.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report
vulnerabilities according to [SECURITY.md](SECURITY.md). Technical security
decisions are documented in [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md).

PCSS is available under the [MIT License](LICENSE). Database services and
third-party software retain their own terms; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
