# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 💼 Other

- Updated jeeves core
## [0.1.4] - 2026-05-31

### 💼 Other

- [87] feat: add jobsDir config field and sync-jobs command (#87)

Add optional jobsDir field to runnerConfigSchema for specifying job
definition file locations. Add sync-jobs CLI command that reads JSON
files from the jobs directory and upserts job definitions into the
SQLite database with schedule validation.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.1.4
## [0.1.3] - 2026-05-30

### 🐛 Bug Fixes

- Externalize @karmaniverous/jeeves across core and openclaw packages
- Bump @karmaniverous/jeeves to ^0.5.11 across all packages
- Use import.meta.url for package.json resolution and add subpath externals

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.1.3
## [0.1.2] - 2026-05-18

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

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.1.2
## [0.1.1] - 2026-05-13

### 🚀 Features

- Create @karmaniverous/jeeves-runner-core package (#73)

### 🐛 Bug Fixes

- Resolve lint warnings in config schema files

### ⚙️ Miscellaneous Tasks

- Add README.md and CHANGELOG.md to core package
- Standardize all packages to rollup with TS config
- Release @karmaniverous/jeeves-runner-core v0.1.1
