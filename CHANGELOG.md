# Changelog

All notable changes to PCSS are documented here. The project follows Semantic
Versioning.

## [1.1.0] - 2026-09-22

### Added

- Multi-select, select all, cancel selection, delete all, and batch tagging in
  the inventory and all search/filter results, with existing or new tags.
- Undo the latest single or batch deletion for 30 minutes within the current
  session. Another deletion, import, or app exit clears the undo record.
- Automatic backups expire after 30 days (still capped at 20 snapshots).
  Unused structure images older than 30 days are also removed at startup and
  hourly while running. Active inventory structures remain available offline.

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
