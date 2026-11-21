# Changelog

All notable changes to PCSS are documented here. The project follows Semantic
Versioning.

## Unreleased

## [1.1.0] - 2026-11-21

### Added

- Multi-select, select all, cancel selection, delete all, and batch tagging in
  the inventory and all search/filter results, with existing or new tags.
- Undo the latest single or batch deletion for 30 minutes within the current
  session. Another deletion, import, or app exit clears the undo record.
- Persistent Trash with inventory search, filters, pagination, selection,
  restore, and configurable 1–14 day retention for new deletions.
- Configurable inventory page size from 1–500 records (default 24), with
  selections retained across pages.
- Offline chemical entry led by CAS and quantity. Incomplete names and formulas
  are filled with paced database checks after connectivity returns.

### Changed

- Consolidate display, database access, and data/backup preferences under the
  System settings gear.
- Make selection controls contextual, including Select all only while selection
  mode is active, and scope batch actions to the current search/filter results.
- Refresh the inventory overview, Add action, Trash navigation, and structure
  image sizing for a more compact working layout.
- Automatic backups expire after 30 days (still capped at 20 snapshots).
  Unused structure images older than 30 days are also removed at startup and
  hourly while running. Active inventory structures remain available offline.
- Preserve the app bundle directory during rebuilds so Dock shortcuts continue
  to point to the latest verified build, with rollback if replacement fails.

### Fixed

- Retry incomplete identity and structure-image recovery at a controlled pace
  after reconnecting, while leaving confirmed image-not-found records alone.
- Crop excessive blank margins from supported molecular structure images while
  retaining CSS containment as a safe fallback for cross-origin images.

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
