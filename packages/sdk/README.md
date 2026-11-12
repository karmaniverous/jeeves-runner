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
  if (isRunnerError(error) && error.code === 'RUNNER_MAX_CONCURRENCY') {
    console.log(`${error.message} (HTTP ${String(error.status)})`);
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

Every failure is a `RunnerError`. Branch on `code`, never on `message`:

| `code` | `status` | When |
| --- | --- | --- |
| the body's `code` | the HTTP status | the runner answered non-2xx with a code (`RUNNER_*`, `JEEVES_*`, `FST_ERR_*`, below); `message` is the body's `message`, `body` the whole body and `responseText` the body as received |
| `http_<status>` | the HTTP status | the runner answered non-2xx without a code: a masked 500 (an unexpected failure; the cause is in the runner log), an unknown route, or a body that isn't the runner's (a proxy's page) |
| `invalid_request` | `0` | the input failed the entry's schema; nothing was sent (`issues`) |
| `invalid_response` | 2xx | the response was not JSON or did not match the entry's schema |
| `timeout` | `0` | no response within the call's timeout |
| `network_error` | `0` | the request failed (runner not running, DNS, ...) |
| `invalid_options` | `0` | `createRunnerClient` options are invalid |

A non-2xx body is always Fastify's standard error body, `{ statusCode, code?, error, message }`. The runner's own codes (`RUNNER_ERROR_CODES` and `RUNNER_ERROR_STATUS`, exported here and by `@karmaniverous/jeeves-runner-core`):

| `code` | Status | When |
| --- | --- | --- |
| `RUNNER_INVALID_SCHEDULE` | 400 | `createJob` / `updateJob` with an invalid cron or RRStack schedule |
| `RUNNER_INVALID_JSONPATH` | 400 | `queryState` / `queryCollection` with a `path` that is not valid JSONPath |
| `RUNNER_INVALID_QUEUE_PAYLOAD` | 400 | `queuePeek` reached a pending item whose stored payload is not JSON |
| `RUNNER_JOB_NOT_FOUND` | 404 | no job has that id |
| `RUNNER_JOB_EXISTS` | 409 | `createJob` with an id a job already has |
| `RUNNER_MAX_CONCURRENCY` | 409 | `triggerJob` refused: the runner is at `maxConcurrency` (not recorded as a run) |
| `RUNNER_TRIGGER_FAILED` | 500 | `triggerJob` failed for any other reason; the cause is in the runner log and, if the run started, on the run (`jobRuns`) |

Also: `FST_ERR_VALIDATION` (400) when a request fails the catalog's schemas (the SDK checks input first, so you see `invalid_request` instead), jeeves' `JEEVES_CONFIG_*` codes from `config` and `configApply`, and `JEEVES_RESPONSE_VALIDATION` (500) if the runner's own response fails its schema.

## OpenAPI

The runner serves its OpenAPI 3.1 document at `GET /openapi.json`; the same document ships as `@karmaniverous/jeeves-runner-core/openapi.json`.

## License

BSD-3-Clause
