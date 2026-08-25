# Changelog

All notable changes to PCSS are documented here. The project follows Semantic
Versioning.

## [1.0.0] - 2026-08-25

### Added

- Local-first macOS chemical inventory with English and Chinese interfaces.
- PubChem identity and structure lookup, UniChem/ChEBI/ChEMBL mapping, and
  optional EPA CompTox access with Keychain-protected credentials.
- SQLite inventory storage, rotating JSON backups, JSON/CSV import and export,
  and transactional migration from the earlier WebKit local-storage format.
- Offline inventory browsing and editing plus cached structure images.
- Duplicate-CAS review and merge workflow, tags, search, filtering, and sorting.
- GitHub-hosted ad-hoc-signed, unnotarized Universal DMG and ZIP release flow
  with explicit Gatekeeper guidance and SHA-256 checksums.
