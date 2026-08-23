# Security architecture

PCSS 1.0 is distributed directly with Developer ID rather than through the Mac
App Store. Release builds enable Apple's Hardened Runtime and are notarized and
stapled. Development builds are ad-hoc signed.

App Sandbox is intentionally not enabled in 1.0. PCSS predates sandboxed data
storage and must transactionally migrate inventory from its existing WebKit
store into `~/Library/Application Support/PCSS/`. Enabling App Sandbox would
move the application into a new container and make that automatic migration
inaccessible. The app does not request broad file-system access: import and
export use user-controlled `NSOpenPanel` and `NSSavePanel` selections.

The embedded WebKit view serves only the bundled UI through the private
`pcss:` scheme. A Content Security Policy blocks arbitrary scripts, objects,
forms, and network connections. External HTTP(S) links are opened in the
default browser; other external navigations are rejected. Native API routes
validate CAS numbers, compound names, inventory schemas, file formats, and
methods before processing them.

Inventory writes use SQLite transactions with full synchronous durability.
The previous inventory is copied to a rotating local JSON backup before a
user-visible mutation. Secrets are not stored in SQLite: the optional CompTox
key uses macOS Keychain.

Network access is limited to HTTPS database endpoints in the native bridge.
PubChem requests pass through a global four-requests-per-second scheduler and
temporary failures use bounded exponential backoff for structure images.
