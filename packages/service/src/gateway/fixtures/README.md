# Gateway `/tools/invoke` fixtures

Real responses from an OpenClaw Gateway, used by `client.test.ts`, `schemas.test.ts` and `session-executor.test.ts` (#125, DD#84).

- **Source:** OpenClaw 2026.9.6 (`eb377ac`), captured 2026-11-09 from the local gateway's `POST /tools/invoke` HTTP API with read-only tools only (`sessions_list`, `sessions_history`, `session_status`).
- **`sessions_spawn.json`:** spawning is not read-only, so this one was not invoked for the capture. Its `result` (`content` + `details`) is a real `sessions_spawn` tool result from the same gateway, read back through `sessions_history` (`includeTools: true`) of the session that made the spawn, and wrapped in the `{ ok: true, result }` envelope that every other captured response uses.
- **Neutralised:** session keys, session/run/actor ids and channel ids are replaced with synthetic values that keep their format (`agent:main:subagent:00000000-0000-4000-8000-…`, `agent:main:slack:channel:c0000000001`); free text (message text and thinking, tool-call arguments, labels, display names, workspace paths, the spawn note, `session_status`'s `statusText`) is replaced with `[neutralised <field>]`. `content[0].text` is the gateway's `JSON.stringify(details, null, 2)`, regenerated from the neutralised details (`session_status`'s text is the status card, so it is just `[neutralised]`). Keys, nesting, types, enum values (`status`, `kind`, `role`, `stopReason`, ...), token counts and timestamps are unchanged. `sessions_list.json` keeps four of the thirteen captured rows: a running channel session, a done sub-agent with `totalTokens`, a done sub-agent without it, and a timed-out sub-agent.
- **Files:** `sessions_history.done.json` (last turn `stop`), `sessions_history.aborted.json` (the timed-out session; last turn `aborted`), `sessions_history.not-found.json` (unknown key: `ok: true` with `details: { status: 'error', error }`).

Not a fixture but recorded here: a tool the gateway does not expose answers HTTP 404 with `{ "ok": false, "error": { "type": "not_found", "message": "Tool not available: <tool>" } }`; the mock gateway in `src/test-utils/gateway.ts` returns exactly that.

To recapture after an OpenClaw change, call the same tools against a live gateway, neutralise the same fields, and keep the structure byte-for-byte otherwise; `schemas.test.ts` then shows which schema no longer matches.
