# PCSS 1.1.0 — 更安全、更高效的本地化学品库存管理

PCSS 1.1.0 是自首个公开版本以来的一次重要功能更新。本版本重点改进了批量库存操作、误删恢复、离线录入、分页浏览和日常界面，并继续坚持本地优先：库存数据不需要账号，也不会上传到 PCSS 服务器。

## 中文更新摘要

- **持久化回收站**：删除的条目会进入本地回收站，可继续搜索、筛选、分页、选择和恢复；新删除记录的保留期可设为 1–14 天。
- **批量库存操作**：支持多选、全选当前结果、批量添加标签和批量删除；操作范围始终受当前搜索与筛选条件约束。
- **更完整的离线录入**：断网时可先使用 CAS、数量和存放位置建立记录；联网后以受控节奏补全缺失的名称、化学式和结构图。
- **分页与统一设置**：每页显示数量可设为 1–500，跨页选择会被保留；显示、数据库访问以及数据/备份设置现集中在右上角的系统设置中。
- **更清晰的工作界面**：库存概览与新增入口更加紧凑，回收站入口移入操作工具栏；分子结构图会尽量裁去多余白边并居中显示。
- **更稳健的本地维护**：自动备份和未使用的结构图片按 30 天策略清理；开发构建会保留 App 包路径，使 Dock 快捷方式保持有效。

## English highlights

- Persistent local Trash with search, filters, pagination, selection, restore,
  and a configurable 1–14 day retention period.
- Scoped multi-select, select-all, batch tagging, and batch deletion across the
  complete current search/filter result, including multiple pages.
- Offline-first entry using CAS, quantity, and location, followed by paced
  identity and structure recovery when connectivity returns.
- Configurable page size, consolidated System settings, a more compact inventory
  workspace, and improved molecular-structure image fitting.
- Thirty-day cleanup for automatic backups and unused structure images, while
  active inventory structures remain cached for offline use.

## Data and privacy

Upgrading preserves the existing SQLite inventory, cached structures, settings,
and backups under `~/Library/Application Support/PCSS/`. Trash records are also
stored locally. PCSS still has no account system, analytics, telemetry,
advertising, or PCSS-operated cloud database. Existing records deleted before
this upgrade cannot be recovered into the new Trash.

## Compatibility and installation

PCSS 1.1.0 supports macOS 13 or later on Apple Silicon and Intel Macs. Release
assets are ad-hoc signed but **not notarized** because the project does not use
the paid Apple Developer Program.

1. Download the Universal macOS DMG below and drag PCSS into Applications.
2. Try to open PCSS once.
3. If macOS blocks it, open **System Settings → Privacy & Security**, choose
   **Open Anyway**, and confirm.

Only download PCSS from this official repository. `SHA256SUMS.txt` is provided
for optional integrity verification. See the
[installation guide](https://github.com/must-bethe-water/Personal_Chemical_Storage_System/blob/v1.1.0/INSTALL.md)
for the full Gatekeeper instructions and security limitations.
