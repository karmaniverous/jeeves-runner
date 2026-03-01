### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.2.0](https://github.com/karmaniverous/jeeves-runner/compare/0.1.2...0.2.0)

- fix: remove UTF-16 null bytes from .gitignore [`#17`](https://github.com/karmaniverous/jeeves-runner/pull/17)
- fix: resolve template literal lint errors [`#16`](https://github.com/karmaniverous/jeeves-runner/pull/16)
- v0.2.0: Queue infrastructure, state migration, session dispatch, scheduler hardening [`#15`](https://github.com/karmaniverous/jeeves-runner/pull/15)
- chore: remove dev-config.json, add to gitignore [`#14`](https://github.com/karmaniverous/jeeves-runner/pull/14)
- feat: add pruneItems and listItemKeys to client API [`#13`](https://github.com/karmaniverous/jeeves-runner/pull/13)
- fix: resolve all code review findings [`#12`](https://github.com/karmaniverous/jeeves-runner/pull/12)
- feat: native session dispatch via Gateway API [`#11`](https://github.com/karmaniverous/jeeves-runner/pull/11)
- feat: Phase 2-4 queue infrastructure + state tables [`#10`](https://github.com/karmaniverous/jeeves-runner/pull/10)
- feat: Phase 2 queue infrastructure with deduplication and retention [`#9`](https://github.com/karmaniverous/jeeves-runner/pull/9)
- feat: Phase 1 — Scheduler hardening (#4, #5, #6) [`#8`](https://github.com/karmaniverous/jeeves-runner/pull/8)
- test: comprehensive test coverage [`7b237d7`](https://github.com/karmaniverous/jeeves-runner/commit/7b237d7cc5fdfb2aaaa7323256038e8f4e01ab3d)
- feat: add state tables and collection API (migration 003) [`fc0e4f5`](https://github.com/karmaniverous/jeeves-runner/commit/fc0e4f5f0ef7265ceec0457125788e2c210ec0fe)
- feat: implement Phase 2 queue infrastructure with deduplication and retention [`7d1932e`](https://github.com/karmaniverous/jeeves-runner/commit/7d1932e1a9a76358b3e0a9740e8b63e5cb45cc94)
- fix: resolve typecheck, lint, and test failures from code review [`7876ea5`](https://github.com/karmaniverous/jeeves-runner/commit/7876ea5f0a1d54dea86afe150e72391b8b63eafd)
- feat: runtime schedule reconciliation (#6) [`e362781`](https://github.com/karmaniverous/jeeves-runner/commit/e36278198bedef576d65a7eb39d594989926b3d2)
- docs: add TSDoc for all exported symbols [`4c4be00`](https://github.com/karmaniverous/jeeves-runner/commit/4c4be00491cff6c1633e070ea7493c7c555102b0)
- refactor: extract queue-ops from client [`6f99a8b`](https://github.com/karmaniverous/jeeves-runner/commit/6f99a8b9f903cd8113a29d000d46761b0cb5dc9b)
- refactor: shared test DB setup, pass logger to server [`19ae9da`](https://github.com/karmaniverous/jeeves-runner/commit/19ae9da01a503c9ba0a2a20909cc9637b8c0b5be)
- docs: suppress Zod __type warnings via typedoc config [`34f29bc`](https://github.com/karmaniverous/jeeves-runner/commit/34f29bca341c8b05deda7c729612c3091a94e69a)
- refactor: extract shared HTTP utility [`9d22ed4`](https://github.com/karmaniverous/jeeves-runner/commit/9d22ed47f281a252a22886fa74d045be31952718)
- feat: notify on schedule registration failures (#4) [`5caaf98`](https://github.com/karmaniverous/jeeves-runner/commit/5caaf98a70d1fbd863861d14bcfcba5d1e752923)
- refactor: extract run-repository and notification helper [`a68894b`](https://github.com/karmaniverous/jeeves-runner/commit/a68894b63de4e723eabe9fd5683a1b73eded31e8)
- fix: atomic dequeue with transaction [`65c140f`](https://github.com/karmaniverous/jeeves-runner/commit/65c140f71181eca3bf0cd099731d97dc116275f9)
- feat: validate schedule on insert (#5) [`7ad8c77`](https://github.com/karmaniverous/jeeves-runner/commit/7ad8c77c6a1d268e142db5e1aad8720602d1125e)
- fix: reject unsupported overlap_policy and improve type safety [`0275ea3`](https://github.com/karmaniverous/jeeves-runner/commit/0275ea37fcf5f63d798f96a605885d621ce3a70a)
- fix: eliminate SQL string interpolation [`1327a66`](https://github.com/karmaniverous/jeeves-runner/commit/1327a66bf4d12bb30d469e6e735c35a1bed8d643)
- fix: async scheduler stop [`e7586d5`](https://github.com/karmaniverous/jeeves-runner/commit/e7586d53d13409cf218331e658b6b9dc7911177e)
- fix: resolve template literal lint errors in collection ops [`6c3f227`](https://github.com/karmaniverous/jeeves-runner/commit/6c3f227b8adbe7927a54d1856e0e4c0b1acba457)
- chore: remove temp files [`bf390b4`](https://github.com/karmaniverous/jeeves-runner/commit/bf390b4eadffd05b4b484924d8d9b5c157a896ea)

#### [0.1.2](https://github.com/karmaniverous/jeeves-runner/compare/0.1.1...0.1.2)

> 25 February 2026

- fix: re-read job from DB on each scheduled run [`#3`](https://github.com/karmaniverous/jeeves-runner/pull/3)
- fix: re-read job from DB on each scheduled run [`#2`](https://github.com/karmaniverous/jeeves-runner/issues/2)
- chore: release v0.1.2 [`267ffe1`](https://github.com/karmaniverous/jeeves-runner/commit/267ffe128d68be2fda7ff91499e990efe3936c00)

#### [0.1.1](https://github.com/karmaniverous/jeeves-runner/compare/0.1.0...0.1.1)

> 25 February 2026

- feat: detect script type by extension in executor (.ps1, .cmd, .bat) [`#1`](https://github.com/karmaniverous/jeeves-runner/pull/1)
- chore: release v0.1.1 [`f77a4fb`](https://github.com/karmaniverous/jeeves-runner/commit/f77a4fb994fcf3c1f18e5e0dfc99a6897784f0b5)

#### 0.1.0

> 25 February 2026

- Initial commit [`4721cc3`](https://github.com/karmaniverous/jeeves-runner/commit/4721cc3dad396c91496643f672328d99456e7cbc)
- chore: release v0.1.0 [`ac0747a`](https://github.com/karmaniverous/jeeves-runner/commit/ac0747a55a176b8d297db918e9722dbac69804f7)
- feat: initial jeeves-runner scaffolding with schemas, db migration, and API structure [`f26fc80`](https://github.com/karmaniverous/jeeves-runner/commit/f26fc8080e6d478893114d5e3236ea5ff1f5b7af)
- chore: set version 0.0.0, ESM-only build, update all deps [`b7378cd`](https://github.com/karmaniverous/jeeves-runner/commit/b7378cd295b1badbc40107a87463732b25bb1aa5)
- feat: implement scheduler, notifier, API, and runner [`eed11f6`](https://github.com/karmaniverous/jeeves-runner/commit/eed11f65e80ce2a95223a92e095d698c95ce14cd)
- docs: comprehensive README for current project state [`c054a53`](https://github.com/karmaniverous/jeeves-runner/commit/c054a531e6ade32a08fa9f78f32637c2b4a36850)
- feat: implement CLI commands, add job seed script, clean unused files [`ef4ae39`](https://github.com/karmaniverous/jeeves-runner/commit/ef4ae39165b7f7c3c530ad070b2a40b980faa73b)
- feat: implement job executor with output capture and slack notifier [`beffd87`](https://github.com/karmaniverous/jeeves-runner/commit/beffd87a8c17d3718f775160a222571dcd763582)
- feat: add maintenance tasks (run pruning, cursor cleanup), executor tests [`551de50`](https://github.com/karmaniverous/jeeves-runner/commit/551de50161cc2eecb8d9e0009a589a7b7ba19a7a)
- feat: implement db connection and migrations [`66f0de9`](https://github.com/karmaniverous/jeeves-runner/commit/66f0de96091279370c36b17fad9aad23bb205857)
- feat: implement client library with cursor and queue ops [`b7b1298`](https://github.com/karmaniverous/jeeves-runner/commit/b7b12980098c40efa3e170496a26c16950d4e389)
- test: add client library tests [`83d07a0`](https://github.com/karmaniverous/jeeves-runner/commit/83d07a0a984facffa4a4e99ffb2a588e377bdac5)
- fix: CLI shebang (single), typed options, remove bin/start.js wrapper [`0f181e8`](https://github.com/karmaniverous/jeeves-runner/commit/0f181e8ca6e2461c57584da7cc9183db8c1f491a)
- chore: upgrade to zod v4 [`4981ec1`](https://github.com/karmaniverous/jeeves-runner/commit/4981ec19f8c75e4aee7e37bb679bda296ee4a729)
- fix: Fastify logger config, add bin/start.js service entry point [`93eef52`](https://github.com/karmaniverous/jeeves-runner/commit/93eef52cb733534407797cbc27d11387a6e9d59e)
- chore: format client tests [`df61fea`](https://github.com/karmaniverous/jeeves-runner/commit/df61fea77d34a07487fa97dadd4592eed6ab2e3e)
- fix: seed jobs disabled by default, ignore bin/ in eslint [`3aa13d5`](https://github.com/karmaniverous/jeeves-runner/commit/3aa13d5385356183dad21586af41ea2b2a676db7)
