# GitHub repository setup

These settings cannot be stored entirely in Git and should be applied by the
maintainer after creating the repository.

## Before the first push

- Review `git status` and the staged diff; do not include `outputs/`, local
  inventories, `.env` files, certificates, Keychains, or notarization profiles.
- Choose whether the current local history should be preserved or the macOS
  rewrite should begin with a fresh public history.
- Confirm that the repository name and organization are final before creating
  the `v1.0.0` release.

## Repository settings

- Enable Issues and the supplied issue forms.
- Enable private vulnerability reporting.
- Enable Dependabot alerts, security updates, and secret scanning.
- Protect `main`: require pull requests, the `CI / macos` check, resolved
  conversations, and protection against force pushes and deletion.
- Restrict GitHub Actions to trusted actions according to the organization's
  policy and require approval for first-time external contributors.
- Set repository topics such as `macos`, `chemistry`, `inventory`,
  `local-first`, and `open-source`.

## First release

1. Push the reviewed source without a version tag and confirm CI passes.
2. Test a CI-built ad-hoc app on both Apple Silicon and Intel where possible.
3. Create and push the `v1.0.0` tag only after the unnotarized warning and
   installation flow are approved.
4. Wait for the Release workflow to ad-hoc sign, package, checksum, and publish
   all three assets without Apple credentials.
5. Download the public assets on a clean Mac, verify the checksum, and confirm
   the documented Privacy & Security → Open Anyway flow before announcing the
   release.
