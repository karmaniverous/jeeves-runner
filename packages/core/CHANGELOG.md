# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 💼 Other

- [93-95] fix: complete 0.10.1 spec gaps (#93, #95, #97)

- Remove timeout from DispatchOptions, dispatchSession, runDispatcher (#93)
- Add script-vs-session env/args scheduler test (#95)
- Sync openclaw.plugin.json version to 0.8.0 (#97)
- Add release-it after:bump hook to auto-sync manifest version
- Fix stale JSDoc on ExecutionOptions.jobEnv
- DRY: extract skip() helper in syncJobs
- Add reconcile-loop prevention tests for never-firing schedules
- Remove redundant weak migration version test
- Sync docs: remove timeout from script-helpers.md, add runners/outputChannel
- Sync docs: add Endpoint/HttpMethod to core README exports
- Sync docs: fix runs/queues/queue_items table schemas in architecture.md
- Sync docs: add queue/state endpoint sections to api-reference.md
- Sync docs: update job response examples with env/args/output_channel fields
## [0.2.0] - 2026-07-15

### 💼 Other

- [94] feat: add state response types to contracts (#94) (#98)

Co-authored-by: jgs-jeeves <jgs-jeeves@users.noreply.github.com> ([#98](https://github.com/karmaniverous/jeeves-runner/pull/98))
- [91-96] fix: SOLID/DRY review -- contract types, error handling, test utils (#94, #92)
- [91-96] test: replace trivial tests, add cron-registry + sync-jobs coverage
- [91-96] docs: sync guides, README, and plugin manifest with 0.10.1 changes

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.2.0
## [0.1.6] - 2026-06-13

### 💼 Other

- [77] feat: add endpoint catalog, canonical schemas, and shared contracts to core

- RUNNER_ENDPOINTS catalog (19 entries) with EndpointDescriptor type and getEndpoint() helper
- Canonical Zod schemas: jobSchema (with sourceType, outputChannel, env, args), createJobSchema, updateJobSchema, updateScriptSchema, runSchema, queueSchema
- Remove 'retry' from runTriggerSchema (DD#46)
- Shared response contracts: JobListItem, RunRecord, QueueStatusResponse, etc.
- 35 tests (endpoints + schemas + existing config)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
- [77][89] test: add coverage for jobEnv, jobArgs, output_channel; remove trivial test

New tests:
- executor: jobEnv vars arrive in child process env
- executor: jobArgs appear in child process argv
- job-routes: POST /jobs round-trips output_channel, env, args
- job-routes: PATCH /jobs/:id updates output_channel, env, args

Removed:
- endpoints: 'should have valid HTTP methods' (redundant with TypeScript satisfies constraint)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.1.6
## [0.1.5] - 2026-06-11

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.1.5
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
