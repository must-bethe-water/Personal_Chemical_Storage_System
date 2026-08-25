# Security architecture

PCSS 1.0 is distributed directly through GitHub without Apple Developer Program
membership. Release and development builds use ad-hoc signatures and are not
notarized. The signature detects changes inside the built bundle but provides
no Apple-verified developer identity, and Gatekeeper blocks the first ordinary
launch. Release filenames, notes, and installation documentation state this
limitation and require a deliberate Privacy & Security override.

The official GitHub repository, protected maintainer account, reproducible
workflow, source review, and published SHA-256 values form the available
distribution controls. Because the checksums and artifacts share one GitHub
trust boundary, checksums are integrity aids rather than independent proof of
authorship.

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
