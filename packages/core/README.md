# @karmaniverous/jeeves-runner-core

Endpoint catalog, OpenAPI document, configuration schema and types for jeeves-runner packages.

The runner's HTTP API is described once, in `RUNNER_CATALOG`: one Zod-described entry per route (name, method, path, request and response schemas, kind, auth). The service registers and validates its routes from it, the OpenAPI document is generated from it, `@karmaniverous/jeeves-runner-sdk` builds its client from it and the OpenClaw plugin describes its tools with it. This package has no Fastify or OpenAPI runtime dependency.

## Exports

#### Endpoint catalog

| Export | Description |
| --- | --- |
| `RUNNER_CATALOG` | The 19 entries (`status`, `config`, `configApply`, `listJobs`, `createJob`, `jobDetail`, `updateJob`, `deleteJob`, `enableJob`, `disableJob`, `updateScript`, `triggerJob`, `jobRuns`, `listQueues`, `queueStatus`, `queuePeek`, `listNamespaces`, `queryState`, `queryCollection`); look one up with `RUNNER_CATALOG.byName(name)` |
| `RunnerCatalog`, `RunnerEntryName`, `RunnerEntry<N>` | The catalog's type, its entry names, one entry by name |
| `RunnerInput<N>`, `RunnerResponse<N>` | Request input (params, query and body fields, flat) and response body of entry `N` |
| `JobRow`, `JobListRow`, `RunRow`, `RunResult`, `RunnerHealth` | Rows and bodies as the routes send them |

#### Response schemas

The bodies the routes send (job and run rows are SQLite rows: snake_case, `enabled` as `0`/`1`, `env`/`args` as JSON text).

| Export | Description |
| --- | --- |
| `jobRowSchema`, `jobListRowSchema` | `GET /jobs/:id` and `GET /jobs` rows |
| `runRowSchema` | `GET /jobs/:id/runs` rows |
| `executionResultSchema` | `POST /jobs/:id/run` result |
| `runnerHealthSchema` | The `health` block of `GET /status` |
| `queueStatusSchema`, `queuePeekItemSchema` | Queue status and peeked items |
| `collectionBodySchema`, `stateCollectionItemSchema` | `GET /state/:namespace/:key` body |
| `jsonPathResultSchema` | `{ result, count }` from a `?path=` JSONPath query |
| `okResponseSchema` | `{ ok: true }` |

#### Errors

Every non-2xx body is Fastify's standard error body, `{ statusCode, code?, error, message }` (`errorBodySchema` in `@karmaniverous/jeeves/catalog`). Branch on `code`.

| Export | Description |
| --- | --- |
| `RUNNER_ERROR_CODES`, `RunnerErrorCode` | The runner's own codes: `RUNNER_INVALID_SCHEDULE`, `RUNNER_INVALID_JSONPATH`, `RUNNER_INVALID_QUEUE_PAYLOAD`, `RUNNER_JOB_NOT_FOUND`, `RUNNER_JOB_EXISTS`, `RUNNER_MAX_CONCURRENCY`, `RUNNER_TRIGGER_FAILED` |
| `RUNNER_ERROR_STATUS` | The HTTP status each is sent with (400, 400, 400, 404, 409, 409, 500) |

When each is sent, and the jeeves and Fastify codes, are in the service's [API reference](../service/guides/api-reference.md#errors).

#### OpenAPI

| Export | Description |
| --- | --- |
| `RUNNER_OPENAPI_DOCUMENT` | The OpenAPI 3.1 document generated from `RUNNER_CATALOG` (the service serves it at `GET /openapi.json`) |
| `@karmaniverous/jeeves-runner-core/openapi.json` | The same document as a file, for code generators |

The document is committed as `openapi.json` and regenerated with `npm run openapi` (release-it runs it after each version bump); a drift test fails when it is out of step with the catalog.

#### Configuration

| Export               | Description                                  |
| -------------------- | -------------------------------------------- |
| `runnerConfigSchema` | Zod schema for the full runner configuration |
| `RunnerConfig`       | Inferred TypeScript type from the schema     |

#### Canonical schemas

| Export | Description |
| --- | --- |
| `jobSchema` | Zod schema for job records |
| `createJobSchema` | Zod schema for job creation (required: id, name, schedule, script); the `createJob` body |
| `updateJobSchema` | Zod schema for job updates (all fields optional); the `updateJob` body |
| `updateScriptSchema` | Zod schema for script-only updates; the `updateScript` body |
| `runSchema`, `runStatusSchema`, `runTriggerSchema` | Zod schemas for run records |
| `queueSchema` | Zod schema for queue records |
| `Job`, `Run`, `RunStatus`, `RunTrigger`, `Queue` | Inferred TypeScript types |
| `CreateJob`, `UpdateJob`, `UpdateScript` | Inferred TypeScript types for mutations |

#### Deprecated

Still exported unchanged; removed in a future breaking release.

| Export | Use instead |
| --- | --- |
| `RUNNER_ENDPOINTS`, `getEndpoint` | `RUNNER_CATALOG`, `RUNNER_CATALOG.byName(name)` |
| `Endpoint`, `EndpointName`, `EndpointDescriptor`, `HttpMethod` | `RunnerEntry<N>`, `RunnerEntryName`, catalog entries |
| `JobListItem`, `JobsResponse`, `JobDetailResponse` | `JobListRow`, `RunnerResponse<'listJobs'>`, `RunnerResponse<'jobDetail'>` (the deprecated types extend the camelCase `Job`, which is not what the routes send) |
| `RunRecord`, `RunsResponse` | `RunRow`, `RunnerResponse<'jobRuns'>` |
| `QueuesResponse`, `QueueStatusResponse`, `QueuePeekItem`, `QueuePeekResponse` | `RunnerResponse<'listQueues' \| 'queueStatus' \| 'queuePeek'>` |
| `NamespacesResponse`, `StateResponse`, `StateCollectionItem`, `CollectionResponse` | `RunnerResponse<'listNamespaces' \| 'queryState' \| 'queryCollection'>` |

## Usage

```typescript
import {
  RUNNER_CATALOG,
  type RunnerResponse,
  runnerConfigSchema,
} from '@karmaniverous/jeeves-runner-core';

const trigger = RUNNER_CATALOG.byName('triggerJob'); // POST /jobs/:id/run
type Runs = RunnerResponse<'jobRuns'>; // { runs: RunRow[] }
```

To call the API, use `@karmaniverous/jeeves-runner-sdk`.

## How Packages Consume It

- **Service** (`packages/service`) - registers every route from `RUNNER_CATALOG` with jeeves `registerCatalogRoutes` and serves `RUNNER_OPENAPI_DOCUMENT`; re-exports the config schema from `src/schemas/config.ts`.
- **SDK** (`packages/sdk`) - builds its client from `RUNNER_CATALOG` with jeeves `createCatalogClient`.
- **Plugin** (`packages/openclaw`) - tool descriptions and the standard tools come from `RUNNER_CATALOG`; tools call the SDK.
