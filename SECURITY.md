# Security policy

## Supported versions

Security fixes are provided for the latest published PCSS release.

## Release authenticity

PCSS releases are ad-hoc signed and are not notarized by Apple. Download only
from this repository's Releases page, verify `SHA256SUMS.txt`, and follow
`INSTALL.md`. A checksum published beside an artifact helps detect accidental
corruption but is not independent proof if the GitHub account itself is
compromised. Report unexpected signatures, filenames, or installation guidance
as a security issue.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability involving code
execution, data loss, credential exposure, or unsafe external navigation.
Use GitHub's private vulnerability reporting feature for this repository. If
that feature is unavailable, contact the repository maintainers through a
private channel listed on their GitHub profiles.

Include the affected PCSS version, macOS version, reproduction steps, and the
impact. Do not include real chemical inventory data or API keys. Maintainers
should acknowledge a complete report within seven days and coordinate a fix
and disclosure timeline with the reporter.
