# @karmaniverous/jeeves-runner-core

Shared configuration schema and types for jeeves-runner packages.

## Exports

#### Configuration
| Export | Description |
|--------|-------------|
| `runnerConfigSchema` | Zod schema for the full runner configuration |
| `RunnerConfig` | Inferred TypeScript type from the schema |

#### Endpoint Catalog
| Export | Description |
|--------|-------------|
| `RUNNER_ENDPOINTS` | Declarative catalog of all 19 HTTP API endpoints (method, path, description) |
| `getEndpoint` | Look up an endpoint by name |
| `EndpointName` | Union type of all endpoint names |
| `EndpointDescriptor` | Type for a single endpoint entry |

#### Canonical Schemas
| Export | Description |
|--------|-------------|
| `jobSchema` | Zod schema for job records |
| `createJobSchema` | Zod schema for job creation (required: id, name, schedule, script) |
| `updateJobSchema` | Zod schema for job updates (all fields optional) |
| `updateScriptSchema` | Zod schema for script-only updates |
| `runSchema`, `runStatusSchema`, `runTriggerSchema` | Zod schemas for run records |
| `queueSchema` | Zod schema for queue records |
| `Job`, `Run`, `RunStatus`, `RunTrigger`, `Queue` | Inferred TypeScript types |
| `CreateJob`, `UpdateJob`, `UpdateScript` | Inferred TypeScript types for mutations |

#### HTTP Response Contracts
| Export | Description |
|--------|-------------|
| `JobListItem`, `JobsResponse` | `GET /jobs` response types |
| `JobDetailResponse` | `GET /jobs/:id` response type |
| `RunRecord`, `RunsResponse` | `GET /jobs/:id/runs` response types |
| `QueueStatusResponse` | `GET /queues/:name/status` — `{ depth, claimedCount, failedCount, oldestAge }` |
| `QueuePeekItem`, `QueuePeekResponse` | `GET /queues/:name/peek` response types |
| `QueuesResponse` | `GET /queues` — `{ queues: string[] }` |
| `NamespacesResponse` | `GET /state` — `{ namespaces: string[] }` |
| `StateResponse` | `GET /state/:namespace` — key-value map |
| `StateCollectionItem`, `CollectionResponse` | `GET /state/:namespace/:key` response types |

## Usage

```typescript
import {
  runnerConfigSchema,
  type RunnerConfig,
} from '@karmaniverous/jeeves-runner-core';
```

## How Packages Consume It

- **Service** (`packages/service`) — re-exports the config schema from `src/schemas/config.ts` for internal consumers.
- **Plugin** (`packages/openclaw`) — config validation flows through `createPluginToolset()` from `@karmaniverous/jeeves`.
