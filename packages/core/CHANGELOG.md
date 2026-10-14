# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-10-14

### 🐛 Bug Fixes

- *(release)* GitHub release notes and changelog use the new version tag

### 💼 Other

- [JEEVES-0] chore(deps): jeeves 0.7.0 and dependency updates

- @karmaniverous/jeeves 0.6.0 -> 0.7.0 (exact) in core, service, openclaw
- all other dependencies to latest within peer constraints; typescript
  held at ^6.0.3 (typescript-eslint 8.71.2 peers typescript <6.1.0);
  happy-dom 20 -> 21
- plugin tests: fetchJson now passes its default timeout signal (jeeves#119)
- [JEEVES-0] fix: no default launcher timeout, trigger status codes, release notes

- core: a manifest without timeout_seconds means no timeout; remove
  DEFAULT_LAUNCHER_TIMEOUT_MS (#119)
- service: typed scheduler errors; POST /jobs/:id/run returns 404/409/500;
  CLI trigger exits 1 on a non-OK response (#118)
- openclaw: runner_trigger uses a 30-minute client timeout (jeeves 0.7.0
  fetchJson defaults to 2 minutes; the route waits for the job)
- release-it: releaseNotes use git-cliff --unreleased
  (karmaniverous/npm-package-template-ts#30)

Closes #118
Closes #119
- [JEEVES-0] fix: address PR #121 review

- CLI trigger reads the body as text so a non-JSON error still reports
  the HTTP status (adds 502 test)
- docs: no-timeout applies to script jobs; session jobs keep the
  5-minute session default
## [0.4.0] - 2026-10-13

### 💼 Other

- [116] feat: sync-jobs from jeeves-scripts list --json; shared manifest mapping in runner-core

- core: pure manifestEntryToJob mapping, list --json schemas, launcher path
  normalisation (DD#61, DD#62, DD#70); scriptsDir config, jobsDir deprecated (DD#64)
- core: update schema built from a defaults-free base so omitted fields stay
  unchanged on PATCH (#114, DD#75)
- service: sync-jobs --scripts-dir/--dry-run/--reset-enabled/--prune; enabled set
  on insert only with drift report (#103, DD#65); manifest schedule applied and
  reverts reported (DD#66); prerequisite informational and printed on add (DD#76);
  orphans disabled only with --prune, never deleted (DD#69); fatal list failures
  write nothing (DD#63); single transaction

Refs #116, #103, #114
- [116] fix: pass the release tag to git-cliff so releases are not filed under [unreleased]

Refs #115
- [116] docs: sync-jobs from jeeves-scripts, scriptsDir/jobsDir, maxConcurrency skips, launcher schedule-revert warnings

Refs #116, #113
- [116] feat: 10s default timeout for launcher jobs; review fixes

- core: DEFAULT_LAUNCHER_TIMEOUT_MS (10s) for manifests without
  timeout_seconds, applied on insert only (DD#71)
- docs: stop recommending a tsx runners entry; generic runners example;
  document the 10s default
- tests: exact --dry-run report output; list --json timeout is fatal;
  default timeout on insert only

Refs #116
- [116] feat: defaultOnFailure/defaultOnSuccess as per-job fallbacks; SOLID/DRY pass

- scheduler: one resolveChannels helper; job result alerts and #113 skip
  alerts fall back to notifications.defaultOnFailure/defaultOnSuccess (DD#77)
- core: mapping reports the fields a manifest specifies (JobField,
  OPTIONAL_JOB_KEYS, specifiedJobFields) so every consumer gets
  omitted-means-unchanged
- service: one toDesiredJob row builder for both sync sources; recordSkip and
  errorMessage helpers; runSyncCommand returns an exit code (testable)
- tests: in-process sync-command suite incl. real-launcher end to end;
  deterministic #113 tests; channel fallback; legacy validation and I/O
  errors; transaction rollback; report labels; CLI flag wiring end to end
  (replaces --help string test)
- docs: fallback semantics in README, configuration guide and skill

Refs #116
- [116] fix: address Copilot review on #117

- sync: orphan detection uses every manifested id, so an entry skipped for
  an invalid schedule is never pruned
- core: explicit timeout_seconds: null means no timeout; only an absent key
  gets the 10s default
- legacy sync: unreadable jobs dir counts as a skip
- scheduler: failure alerts (#113 skip and startup) catch and log
  notifier errors; alert helpers moved to scheduler/alerts.ts
- tests: typed output mock; split oversized test files (sync-scripts,
  sync-orphans, run-scripts-list, sync-jobs.cli, job-routes.fields) with
  a shared scripts-sync harness; regression tests for each fix

Refs #116, #113
- [116] chore(release): name GitHub releases <package>@<version>

Refs #116

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.4.0
## [0.3.0] - 2026-09-29

### 💼 Other

- [104] updated jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.3.0
## [0.2.2-2] - 2026-09-28

### 💼 Other

- [104] chore(deps): pin @karmaniverous/jeeves 0.6.0-9
- [104] chore: release @karmaniverous/jeeves-runner-core v0.2.2-2
## [0.2.2-1] - 2026-09-27

### 💼 Other

- [104] fix(release): update root package-lock in after:bump hook
- [104] chore(deps): pin @karmaniverous/jeeves 0.6.0-8
- [104] chore: release @karmaniverous/jeeves-runner-core v0.2.2-1
## [0.2.2-0] - 2026-09-27

### 💼 Other

- [104] chore(deps): ncu -u --peer across all packages (reject @karmaniverous/jeeves)
- [104] chore(prettier): format docs/config files; ignore generated CHANGELOG.md
- [104] feat: move core and service to @karmaniverous/jeeves 0.6.0-4; drop v0.x TOOLS.md descriptor fields
- [104] chore(deps): pin @karmaniverous/jeeves 0.6.0-6
- [104] fix(release): use --github.preRelease for release-it 21
- [104] fix(deps): runner-core ^0.2.2-0 for single core copy; engines node >=22.13 (#108, #110)
- [104] chore(deps): pin @karmaniverous/jeeves 0.6.0-7
- [104] chore: release @karmaniverous/jeeves-runner-core v0.2.2-0
## [0.2.1] - 2026-07-15

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

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-runner-core v0.2.1
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
