# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 🐛 Bug Fixes

- Pin jeeves-runner-core dependency to ^0.1.1
## [0.9.10] - 2026-05-16

### 💼 Other

- [ISSUES-50] fix: resolve dispatcher issues and update skill docs (#50, #64, #70, #78)

- Use resolveCommand() in dispatchSession instead of hardcoded 'node' (#78)
- Add runners option to DispatchOptions for custom command resolution
- Fix session completion polling to use status from sessions_list (#70)
- Fall back to history-based check when session not in sessions_list
- Add outputChannel to job schema and DB migration (#64)
- Change dispatchSession to capture stdout and return DispatchResult
- Update SKILL.md with script authoring reference and job patterns (#50)
- Add tests for resolveCommand in dispatchSession, status-based completion,
  outputChannel schema validation, and stdout capture

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [ISSUES-50] fix: cache trimmed stdout, keep String() for lint compliance (review feedback)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.10
## [0.9.9] - 2026-05-13

### 🚀 Features

- Create @karmaniverous/jeeves-runner-core package (#73)

### 🐛 Bug Fixes

- Resolve lint warnings in config schema files

### ⚙️ Miscellaneous Tasks

- Add npm publish safety net (.npmignore + gitignore *.local)
- Move changelog generation to after:bump hook
- Migrate changelog from auto-changelog to git-cliff (#75)
- Bump @karmaniverous/jeeves to ^0.5.10
- Apply minor/patch dependency updates via ncu
- Standardize all packages to rollup with TS config
- Release @karmaniverous/jeeves-runner v0.9.9
## [0.9.8] - 2026-05-03

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.8
## [0.9.7] - 2026-04-22

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.7
## [0.9.6] - 2026-04-15

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.6
## [0.9.5] - 2026-04-08

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.5
## [0.9.4] - 2026-04-05

### 💼 Other

- Unhoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.4
## [0.9.3] - 2026-04-05

### 💼 Other

- Hoisted jeeves
- Removed knip from packages

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.3
## [0.9.2] - 2026-04-05

### 🐛 Bug Fixes

- Resolve runner version at runtime instead of build time

### 💼 Other

- [65] fix: remove redundant replace plugin from runner rollup config
- [67] fix: consume core importMetaUrl in plugin CLI, bump @karmaniverous/jeeves to ^0.5.4

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.2
## [0.9.1] - 2026-04-05

### ⚙️ Miscellaneous Tasks

- Update dependencies, bump @karmaniverous/jeeves to ^0.5.3
- Release @karmaniverous/jeeves-runner v0.9.1
## [0.9.0] - 2026-04-03

### 🚀 Features

- Bump @karmaniverous/jeeves to ^0.5.1
- Bump @karmaniverous/jeeves to ^0.5.1

### 🐛 Bug Fixes

- Resolve all build/docs warnings

### 🚜 Refactor

- Remove hoisted script utilities from runner
- Adopt core v0.5.1 APIs across runner and plugin
- Extract shared scheduler test helpers and deduplicate constants
- Adopt core v0.5.1 APIs across runner and plugin
- Extract shared scheduler test helpers and deduplicate constants

### 📚 Documentation

- Update skill, guides, and tests for v0.9.0 core adoption
- Update skill, guides, and tests for v0.9.0 core adoption

### 🧪 Testing

- Close coverage gaps for v0.9.0 core adoption
- Close coverage gaps for v0.9.0 core adoption

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.9.0
## [0.8.3] - 2026-03-31

### 💼 Other

- [CORE-046] chore(core): integrate 0.4.6 init fix

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.8.3
## [0.8.2] - 2026-03-30

### 🐛 Bug Fixes

- *(core)* Integrate descriptor run callback

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.8.2
## [0.8.1] - 2026-03-30

### 🐛 Bug Fixes

- *(service)* Correct startCommand path doubling in descriptor

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.8.1
## [0.8.0] - 2026-03-30

### 🚀 Features

- *(service)* Implement v0.8.0 Phase 1 foundation tasks\n\nP1.1: Config path migration - migrateConfig() function with auto-migration\n      from legacy flat config to nested directory layout (#42)\nP1.2: Bind address - replace hardcoded 127.0.0.1 default with\n      DEFAULT_BIND_ADDRESS from @karmaniverous/jeeves (#42)\nP1.3: Version reporting fix - inject version at build time via\n      @rollup/plugin-replace instead of runtime package.json reads (#39, #26)\nP1.4: Session executor validation - added comprehensive tests verifying\n      type='session' flows correctly through cron-registry -> scheduler ->\n      session-executor for both manual triggers and scheduled fires (#43)\nP1.5: RRStack reconciliation fix - track next fire times in cron-registry\n      and re-register jobs whose fire time is in the past during\n      reconciliation, preventing stale timers after failed re-arms (#44)\nP1.6: Script utilities hoist - copied and genericized fs-utils, shell,\n      run-script, runner-client, google-auth, spawn-worker, and\n      slack-workspace from jeeves-runner-scripts into client/ (#49)\n\nAlso fixes pre-existing TSDoc lint warnings in executor.ts.
- Implement v0.8.0 Phase 2 — descriptor + independent plugin work
- Implement v0.8.0 Phase 3 — factory consumers
- *(service)* Add init-scripts CLI command

### 🐛 Bug Fixes

- *(service)* Resolve TSDoc warnings in google-auth
- Require Node >=22 (node:sqlite), skip Node 20 in CI

### 🚜 Refactor

- *(service)* Remove redundant version prop from route/server deps
- *(service)* DRY — extract shared pino options builder and CLI withDb helper
- Address Gemini PR review feedback

### 📚 Documentation

- Full documentation audit for v0.8.0 Component SDK adoption
- Add script helpers guide, update index.md patterns, README helpers table

### 🧪 Testing

- Audit branch coverage — remove trivial tests, add missing tests

### ⚙️ Miscellaneous Tasks

- Bump @karmaniverous/jeeves to ^0.4.3 in service and openclaw packages
- Update all dependencies including @karmaniverous/jeeves ^0.4.4 (Zod v4)
- Release @karmaniverous/jeeves-runner v0.8.0
## [0.7.4] - 2026-03-29

### 🐛 Bug Fixes

- *(service)* Add require condition to exports map for CJS compatibility

### 💼 Other

- [47] feat(service): replace tsRunner with configurable runners map keyed by extension

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.7.4
## [0.7.3] - 2026-03-29

### 💼 Other

- [45] feat(service): add configurable tsRunner for TypeScript scripts

### 🧪 Testing

- Skip .cmd and .ps1 executor tests on non-Windows platforms

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.7.3
## [0.7.2] - 2026-03-25

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.7.2
## [0.7.1] - 2026-03-23

### ⚙️ Miscellaneous Tasks

- Bump rrstack to 0.17.1 (fixes minutely nextEvent hang)
- Release @karmaniverous/jeeves-runner v0.7.1
## [0.7.0] - 2026-03-22

### ⚙️ Miscellaneous Tasks

- Update core dependency to v0.3.0 and migrate /health to /status (#36, #37)
- Release @karmaniverous/jeeves-runner v0.7.0
## [0.6.0] - 2026-03-22

### 🚀 Features

- *(service)* Phase 1 — scheduling foundation with RRStack support
- *(service)* Phase 2 — job management endpoints and inline scripts
- *(service)* Phase 3 — queue and state inspection endpoints
- *(service)* Add configurable bind address (#34)

### 🐛 Bug Fixes

- *(service)* Add JSONPath support to GET /state/:namespace/:key

### 🚜 Refactor

- Change PUT /jobs/:id to PATCH (partial update semantics)
- Remove deprecated POST enable/disable aliases
- DRY toggle route and harden tool helper
- DRY job-not-found constant, eliminate SELECT-before-UPDATE, add @module tags
- Extract shared route test harness, fix corrupted emoji in slack notifier
- Complete SOLID/DRY sweep — field-map update builder, single-query queue status, shared test fixtures, fix unimplemented overlap policy, CLI rrstack validation

### 📚 Documentation

- Add @module TSDoc tags to all source modules

### 🧪 Testing

- Split large test files (routes, scheduler) to respect 300 LOC limit

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.6.0
## [0.5.0] - 2026-03-21

### ⚙️ Miscellaneous Tasks

- Adopt @karmaniverous/jeeves ^0.2.0 core SDK (#33) ([#33](https://github.com/karmaniverous/jeeves-runner/pull/33))
- Release @karmaniverous/jeeves-runner v0.5.0
## [0.4.1] - 2026-03-19

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.4.1
## [0.4.0] - 2026-03-18

### 🐛 Bug Fixes

- Add tagPrefix to auto-changelog config for monorepo tags

### 📚 Documentation

- Sync documentation with v0.3.1 implementation

### ⚙️ Miscellaneous Tasks

- Remove stale plantuml from knip ignoreBinaries
- Release @karmaniverous/jeeves-runner v0.4.0
## [0.3.1] - 2026-03-04

### 🐛 Bug Fixes

- Add PRAGMA busy_timeout=5000 to prevent SQLITE_BUSY errors

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner v0.3.1
## [0.3.0] - 2026-03-03

### 🚀 Features

- Restructure as npm workspaces monorepo
- [**breaking**] Remove cursor backward-compat aliases, rename to state API
- Change default port from 3100 to 1937
- Add service install/uninstall CLI command (Linux/Windows/macOS)
- Add validate, init, and config-show CLI commands

### 🐛 Bug Fixes

- Update typedoc, knip, and stan configs for monorepo paths
- Resolve all tsdoc and typedoc warnings

### 💼 Other

- Resolve conflicts with main (keep next structure)

### 🚜 Refactor

- Code review cleanup — trim trivial tests, merge notification helper, add maintenance coverage

### 📚 Documentation

- Add service and plugin guides, architecture diagrams, fix typedoc config

### ⚙️ Miscellaneous Tasks

- Update dependencies (eslint-plugin-tsdoc, @types/node)
- Release @karmaniverous/jeeves-runner v0.3.0
