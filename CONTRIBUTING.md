# Contributing

Thank you for helping improve PCSS.

## Development

Requirements are macOS 13 or later, Node.js 22.13 or later, and Xcode Command
Line Tools.

```bash
npm ci
npm test
npm run build
```

Keep changes focused. Add or update tests for persistence, import/export,
network error handling, or data migrations. Never commit inventories, API keys,
Apple certificates, notarization credentials, or generated `outputs/` files.

## Pull requests

Describe the user-visible behavior, offline behavior, data migration impact,
and verification performed. Changes to the persisted schema must be backward
compatible and include a tested migration. By contributing, you agree that
your contribution is licensed under the repository's MIT License.
