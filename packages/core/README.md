# @karmaniverous/jeeves-runner-core

Shared configuration schema and types for jeeves-runner packages.

## Exports

### Configuration Schema

| Export | Description |
|--------|-------------|
| `runnerConfigSchema` | Zod schema for the full runner configuration (port, host, dbPath, concurrency, notifications, logging, gateway, runners) |
| `RunnerConfig` | Inferred TypeScript type from the schema |

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
