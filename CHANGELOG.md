### Changelog

All notable changes to this project will be documented in this file. Dates are displayed in UTC.

#### [0.1.2](https://github.com/karmaniverous/jeeves-runner/compare/0.1.1...0.1.2)

- fix: re-read job from DB on each scheduled run [`#3`](https://github.com/karmaniverous/jeeves-runner/pull/3)
- fix: re-read job from DB on each scheduled run [`#2`](https://github.com/karmaniverous/jeeves-runner/issues/2)

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
