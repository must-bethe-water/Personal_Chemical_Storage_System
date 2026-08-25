# Installing PCSS from GitHub

> **Apple has not notarized this build.** PCSS uses an ad-hoc code signature
> because the project does not participate in the paid Apple Developer Program.
> macOS will therefore block the first ordinary launch even when the download
> is intact.

1. Download the Universal macOS DMG from this release and compare its SHA-256
   value with `SHA256SUMS.txt`.
2. Open the DMG and drag PCSS to Applications.
3. Try to open PCSS once and dismiss the macOS warning.
4. Open **System Settings → Privacy & Security**, scroll to Security, and click
   **Open Anyway** for PCSS.
5. Authenticate if macOS asks, confirm **Open**, and review the source and
   privacy documentation before storing sensitive inventory data.

Apple documents this override in
[Safely open apps on your Mac](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac).
Only download PCSS from the project's official GitHub Releases page. An ad-hoc
signature verifies bundle consistency but does not establish a verified
developer identity. The published checksum helps detect an incomplete or
altered download, but it is hosted by the same GitHub account as the artifact
and is not an independent trust anchor.
