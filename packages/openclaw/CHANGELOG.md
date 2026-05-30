# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 🐛 Bug Fixes

- Externalize @karmaniverous/jeeves across core and openclaw packages
- Bump @karmaniverous/jeeves to ^0.5.11 across all packages
- Use import.meta.url for package.json resolution and add subpath externals
## [0.7.10] - 2026-05-16

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

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.10
## [0.7.9] - 2026-05-13

### 🚀 Features

- Add contracts.tools to openclaw plugin manifest (#72)

### ⚙️ Miscellaneous Tasks

- Add npm publish safety net (.npmignore + gitignore *.local)
- Move changelog generation to after:bump hook
- Migrate changelog from auto-changelog to git-cliff (#75)
- Bump @karmaniverous/jeeves to ^0.5.10
- Apply minor/patch dependency updates via ncu
- Standardize all packages to rollup with TS config
- Release @karmaniverous/jeeves-runner-openclaw v0.7.9
## [0.7.8] - 2026-05-03

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.8
## [0.7.7] - 2026-04-22

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.7
## [0.7.6] - 2026-04-15

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.6
## [0.7.5] - 2026-04-08

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.5
## [0.7.4] - 2026-04-05

### 💼 Other

- Unhoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.4
## [0.7.3] - 2026-04-05

### 💼 Other

- Removed knip from packages

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.3
## [0.7.2] - 2026-04-05

### 💼 Other

- [67] fix: consume core importMetaUrl in plugin CLI, bump @karmaniverous/jeeves to ^0.5.4

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.2
## [0.7.1] - 2026-04-05

### ⚙️ Miscellaneous Tasks

- Update dependencies, bump @karmaniverous/jeeves to ^0.5.3
- Release @karmaniverous/jeeves-runner-openclaw v0.7.1
## [0.7.0] - 2026-04-04

### 🚀 Features

- Bump @karmaniverous/jeeves to ^0.5.1
- Bump @karmaniverous/jeeves to ^0.5.1

### 🐛 Bug Fixes

- Correct getRunnerClient import source in SKILL.md
- Correct getRunnerClient import source in SKILL.md
- Resolve all build/docs warnings

### 🚜 Refactor

- Adopt core v0.5.1 APIs across runner and plugin
- Adopt core v0.5.1 APIs across runner and plugin

### 📚 Documentation

- Update skill, guides, and tests for v0.9.0 core adoption
- Update skill, guides, and tests for v0.9.0 core adoption

### 🧪 Testing

- Close coverage gaps for v0.9.0 core adoption
- Close coverage gaps for v0.9.0 core adoption

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.7.0
## [0.6.2] - 2026-03-31

### 💼 Other

- [CORE-046] chore(core): integrate 0.4.6 init fix

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.6.2
## [0.6.1] - 2026-03-30

### 🐛 Bug Fixes

- *(core)* Integrate descriptor run callback

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.6.1
## [0.6.0] - 2026-03-30

### 🚀 Features

- Implement v0.8.0 Phase 2 — descriptor + independent plugin work
- Implement v0.8.0 Phase 3 — factory consumers

### 🐛 Bug Fixes

- Require Node >=22 (node:sqlite), skip Node 20 in CI

### 🚜 Refactor

- Address Gemini PR review feedback

### 📚 Documentation

- Full documentation audit for v0.8.0 Component SDK adoption
- Add script helpers guide, update index.md patterns, README helpers table

### 🧪 Testing

- Audit branch coverage — remove trivial tests, add missing tests

### ⚙️ Miscellaneous Tasks

- Bump @karmaniverous/jeeves to ^0.4.3 in service and openclaw packages
- Update all dependencies including @karmaniverous/jeeves ^0.4.4 (Zod v4)
- Release @karmaniverous/jeeves-runner-openclaw v0.6.0
## [0.5.1] - 2026-03-25

### 🐛 Bug Fixes

- *(openclaw)* Do not send Content-Type on bodyless DELETE requests

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.5.1
## [0.5.0] - 2026-03-22

### ⚙️ Miscellaneous Tasks

- Update core dependency to v0.3.0 and migrate /health to /status (#36, #37)
- Release @karmaniverous/jeeves-runner-openclaw v0.5.0
## [0.4.0] - 2026-03-22

### 🚀 Features

- *(openclaw)* Add 10 management & inspection tools, update enable/disable to PATCH
- *(openclaw)* Show schedule format and source type in TOOLS.md content

### 🚜 Refactor

- Change PUT /jobs/:id to PATCH (partial update semantics)
- DRY toggle route and harden tool helper
- Complete SOLID/DRY sweep — field-map update builder, single-query queue status, shared test fixtures, fix unimplemented overlap policy, CLI rrstack validation

### 📚 Documentation

- Update SKILL.md, guides, and README for v0.6.0 tools

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.4.0
## [0.3.0] - 2026-03-21

### ⚙️ Miscellaneous Tasks

- Adopt @karmaniverous/jeeves ^0.2.0 core SDK (#33) ([#33](https://github.com/karmaniverous/jeeves-runner/pull/33))
- Release @karmaniverous/jeeves-runner-openclaw v0.3.0
## [0.2.1] - 2026-03-19

### 💼 Other

- Bundle @karmaniverous/jeeves into plugin dist
- Remove dead local resolveWorkspacePath from helpers.ts (use core export)

### ⚙️ Miscellaneous Tasks

- Upgrade @karmaniverous/jeeves to 0.1.3, remove content copy (now inlined at build)
- Upgrade @karmaniverous/jeeves to 0.1.5 (workspace resolution fix)
- Upgrade @karmaniverous/jeeves to 0.1.4, use core resolveWorkspacePath
- Upgrade @karmaniverous/jeeves to 0.1.5 (workspace resolution fix)
- Upgrade @karmaniverous/jeeves to 0.1.6, add servicePackage + pluginPackage
- Release @karmaniverous/jeeves-runner-openclaw v0.2.1
## [0.2.0] - 2026-03-18

### 🚀 Features

- Adopt @karmaniverous/jeeves core in openclaw plugin

### 🐛 Bug Fixes

- Add tagPrefix to auto-changelog config for monorepo tags
- Derive component version from package.json instead of hard-coding

### 🚜 Refactor

- Use createAsyncContentCache from core, fix version to plugin version
- DRY - getApiUrl via getPluginConfig, extract shared jobId param schema

### 📚 Documentation

- Sync documentation with v0.3.1 implementation

### 🧪 Testing

- Add serviceCommands tests, strengthen generateContent + index coverage

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.2.0
## [0.1.0] - 2026-03-03

### 🚀 Features

- Restructure as npm workspaces monorepo
- Add OpenClaw plugin with 7 runner tools, install CLI, and consumer skill

### 💼 Other

- Zeroed version

### 🚜 Refactor

- Code review cleanup — trim trivial tests, merge notification helper, add maintenance coverage

### 📚 Documentation

- Add service and plugin guides, architecture diagrams, fix typedoc config

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-openclaw v0.1.0
