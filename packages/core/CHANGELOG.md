# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 💼 Other

- [81] feat: config harmonization (gatewayUrl, gatewayApiKey, logging) #81

Replace nested gateway.url/gateway.tokenPath with flat gatewayUrl/gatewayApiKey.
Replace log.level/log.file with logging.level/logging.file.
Add backward-compat preprocess transform for old config shape.
gatewayApiKey is a direct string value (no more file indirection via tokenPath).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [81] fix: update stale error message and add combined migration test

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [81] fix: address review — warn on tokenPath removal, consistent log key cleanup
## [0.1.1] - 2026-05-13

### 🚀 Features

- Create @karmaniverous/jeeves-runner-core package (#73)

### 🐛 Bug Fixes

- Resolve lint warnings in config schema files

### ⚙️ Miscellaneous Tasks

- Add README.md and CHANGELOG.md to core package
- Standardize all packages to rollup with TS config
- Release @karmaniverous/jeeves-runner-core v0.1.1
