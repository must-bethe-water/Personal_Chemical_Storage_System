# Privacy

PCSS is local-first. It has no PCSS account, analytics, advertising, telemetry,
or PCSS-operated server.

## Data stored on the Mac

- Inventory records are stored in SQLite under
  `~/Library/Application Support/PCSS/`.
- Cached PubChem structure images and the 20 most recent JSON inventory
  snapshots are stored in the same directory.
- Interface preferences use the embedded WebKit data store.
- An optional EPA CompTox API key is stored in macOS Keychain.

The user can export inventory data as JSON or CSV. PCSS does not automatically
upload inventory or backup files.

## Network requests

Online database features necessarily send chemical identifiers to the selected
public service:

- English compound names and CAS numbers may be sent to PubChem.
- InChIKeys may be sent to EMBL-EBI UniChem to resolve ChEBI and ChEMBL IDs.
- CAS numbers are sent to EPA CompTox only after the user configures an API key.
- Opening an official-record link launches the default browser and contacts
  that website.
- A user-supplied custom HTTPS structure-image URL contacts the host in that
  URL when the image is displayed.

Those services receive ordinary network metadata such as the user's IP address
and apply their own privacy policies and terms. Inventory quantities, storage
locations, and custom tags are not included in these lookup requests.

## Deletion

Deleting an entry moves it to the local Trash for the configured 1–14 days
(default 7). The user can restore it during that period. Expired Trash records
are purged at startup, on Trash access, and hourly while the app runs. Older
inventory backups may still contain a copy for up to 30 days. Exported files
are managed by the user. To erase all
PCSS inventory data, quit PCSS and remove
`~/Library/Application Support/PCSS/`; remove the CompTox key from PCSS settings
or macOS Keychain separately.
