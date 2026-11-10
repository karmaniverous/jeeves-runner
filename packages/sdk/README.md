# @karmaniverous/jeeves-runner-sdk

Typed TypeScript client for the [jeeves-runner](https://github.com/karmaniverous/jeeves-runner) HTTP API: jobs, runs, manual triggers, queues, state and config.

The client is generated from the runner's endpoint catalog (`RUNNER_CATALOG` in `@karmaniverous/jeeves-runner-core`), so every method, input and response type matches the routes the service registers. Requests are validated before they are sent and responses are parsed on arrival.

## Install

```bash
npm install @karmaniverous/jeeves-runner-sdk
```

Requires Node.js 24.22.2 or later.

## Usage

```typescript
import {
  createRunnerClient,
  isRunnerError,
} from '@karmaniverous/jeeves-runner-sdk';

const runner = createRunnerClient({ baseUrl: 'http://127.0.0.1:1937' });

const { jobs } = await runner.listJobs();
const { runs } = await runner.jobRuns({ id: 'poll-email', limit: 5 });

try {
  const { result } = await runner.triggerJob({ id: 'poll-email' });
  console.log(result.status, result.durationMs);
} catch (error) {
  if (isRunnerError(error) && error.status === 409) {
    console.log('Runner is at maxConcurrency; try later.');
  } else throw error;
}
```

Every method is named after its catalog entry and takes one input object holding the entry's path parameters, query fields and body fields, flat:

| Method | Route | Input |
| --- | --- | --- |
| `status` | `GET /status` | none |
| `config` | `GET /config` | `{ path? }` |
| `configApply` | `POST /config/apply` | `{ patch, replace? }` |
| `listJobs` | `GET /jobs` | none |
| `createJob` | `POST /jobs` | job fields (`id`, `name`, `schedule`, ...) |
| `jobDetail` | `GET /jobs/:id` | `{ id }` |
| `updateJob` | `PATCH /jobs/:id` | `{ id, ...fields }` |
| `deleteJob` | `DELETE /jobs/:id` | `{ id }` |
| `enableJob` | `PATCH /jobs/:id/enable` | `{ id }` |
| `disableJob` | `PATCH /jobs/:id/disable` | `{ id }` |
| `updateScript` | `PUT /jobs/:id/script` | `{ id, script, source_type? }` |
| `triggerJob` | `POST /jobs/:id/run` | `{ id }` |
| `jobRuns` | `GET /jobs/:id/runs` | `{ id, limit? }` |
| `listQueues` | `GET /queues` | none |
| `queueStatus` | `GET /queues/:name/status` | `{ name }` |
| `queuePeek` | `GET /queues/:name/peek` | `{ name, limit? }` |
| `listNamespaces` | `GET /state` | none |
| `queryState` | `GET /state/:namespace` | `{ namespace, path? }` |
| `queryCollection` | `GET /state/:namespace/:key` | `{ namespace, key, limit?, order?, path? }` |

Responses are the bodies the routes send: job and run rows are SQLite rows (snake_case, `enabled` as `0`/`1`, `env`/`args` as JSON text). The request and response types are exported (`RunnerInput<'createJob'>`, `RunnerResponse<'listJobs'>`, `JobRow`, `RunRow`, `RunResult`, ...). Responses are parsed against the schemas of the runner-core version the SDK was built with: fields a newer runner adds are dropped until you upgrade the SDK.

## Timeouts

- Every call times out after **120 s** by default (`timeoutMs` option).
- `triggerJob` waits for the job to finish, so it defaults to **30 minutes** (`triggerTimeoutMs` option). A client timeout never stops the job: it runs on to its own `timeout_ms`.
- Any call can override its timeout: `runner.triggerJob({ id }, { timeoutMs: 60_000 })`.

The SDK never retries.

## Errors

Every failure is a `RunnerError`:

| `code` | `status` | When |
| --- | --- | --- |
| `http_<status>` | the HTTP status | the runner answered non-2xx; `body` holds `{ error, ... }` and `responseText` the body as received |
| `invalid_request` | `0` | the input failed the entry's schema; nothing was sent (`issues`) |
| `invalid_response` | 2xx | the response was not JSON or did not match the entry's schema |
| `timeout` | `0` | no response within the call's timeout |
| `network_error` | `0` | the request failed (runner not running, DNS, ...) |
| `invalid_options` | `0` | `createRunnerClient` options are invalid |

`triggerJob` answers **404** for an unknown job, **409** when the runner is at `maxConcurrency` (the trigger is refused and not recorded as a run) and **500** for any other failure.

## OpenAPI

The runner serves its OpenAPI 3.1 document at `GET /openapi.json`; the same document ships as `@karmaniverous/jeeves-runner-core/openapi.json`.

## License

BSD-3-Clause
