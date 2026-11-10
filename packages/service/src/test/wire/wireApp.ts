/**
 * @module test/wire/wireApp
 * The real `createServer` on a seeded temp database, a scriptable scheduler stub and a temp config file, for the routes' wire baseline (spec 4B.3 note 3). Writes temp files; no network.
 *
 * The harness must stay portable to tag `service/0.14.0-0`
 * (`scripts/capture-wire.ts` copies it there): it may only import
 * service modules that already exist at that tag.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { createServer } from '../../api/server.js';
import { closeConnection, createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { createRunnerDescriptor } from '../../descriptor.js';
import {
  JobNotFoundError,
  MaxConcurrencyError,
} from '../../scheduler/errors.js';
import type { ExecutionResult } from '../../scheduler/executor.js';
import type { Scheduler } from '../../scheduler/scheduler.js';
import { runnerConfigSchema } from '../../schemas/config.js';
import { resetWireDb } from './wireSeed.js';

/** How the stub scheduler answers `triggerJob`. */
export type TriggerOutcome =
  'ok' | 'timeout' | 'notFound' | 'maxConcurrency' | 'error' | 'nonError';

/** Scriptable scheduler behaviour, reset before every scenario. */
export interface WireState {
  /** `triggerJob` outcome. */
  trigger: TriggerOutcome;
  /** `getRunningJobs` result. */
  running: string[];
  /** `getFailedRegistrations` result. */
  failedRegistrations: string[];
}

/** Behaviour every scenario starts from. */
export const DEFAULT_WIRE_STATE: WireState = {
  trigger: 'ok',
  running: [],
  failedRegistrations: [],
};

/** Config the service runs with (`GET /config`) and the apply file's start. */
export const WIRE_CONFIG = {
  port: 1937,
  host: '127.0.0.1',
  dbPath: './data/wire.sqlite',
  maxConcurrency: 2,
};

/** A finished run, in the key order the executors build results. */
const OK_RESULT: ExecutionResult = {
  status: 'ok',
  exitCode: 0,
  durationMs: 1234,
  tokens: 7,
  resultMeta: 'meta',
  stdoutTail: 'out',
  stderrTail: '',
  error: null,
};

/** A timed-out run. */
const TIMEOUT_RESULT: ExecutionResult = {
  status: 'timeout',
  exitCode: null,
  durationMs: 5000,
  tokens: null,
  resultMeta: null,
  stdoutTail: '',
  stderrTail: '',
  error: 'Job timed out after 5000ms',
};

/** Error-shaped but not an `Error` instance. */
const ODD_REJECTION: Error = { name: 'Odd', message: 'odd' };

/** A started wire app. */
export interface WireApp {
  /** The Fastify app from `createServer`. */
  app: FastifyInstance;
  /** Scheduler behaviour (mutate per scenario). */
  state: WireState;
  /** The app's database. */
  db: ReturnType<typeof createConnection>;
  /** Temp directory holding the database and config file. */
  dir: string;
  /** Restore the seed rows, the config file and {@link DEFAULT_WIRE_STATE}. */
  reset: () => void;
  /** Close the app and remove temp files. */
  close: () => Promise<void>;
}

/**
 * Build the scheduler stub.
 *
 * @param state - Live behaviour.
 * @returns A scheduler whose `triggerJob` follows `state.trigger`.
 */
function stubScheduler(state: WireState): Scheduler {
  return {
    start: () => undefined,
    stop: () => Promise.resolve(),
    reconcileNow: () => undefined,
    getRunningJobs: () => state.running,
    getFailedRegistrations: () => state.failedRegistrations,
    triggerJob: (jobId: string) => {
      switch (state.trigger) {
        case 'ok':
          return Promise.resolve({ ...OK_RESULT });
        case 'timeout':
          return Promise.resolve({ ...TIMEOUT_RESULT });
        case 'notFound':
          return Promise.reject(new JobNotFoundError(jobId));
        case 'maxConcurrency':
          return Promise.reject(new MaxConcurrencyError());
        case 'error':
          return Promise.reject(new Error('database is locked'));
        case 'nonError':
          // Error-shaped but not an Error instance: the route's fallback text.
          return Promise.reject(ODD_REJECTION);
      }
    },
  };
}

/**
 * Start the wire app.
 *
 * @returns The started app; call `close` in `afterAll`.
 */
export async function startWireApp(): Promise<WireApp> {
  const dir = mkdtempSync(join(tmpdir(), 'jeeves-runner-wire-'));
  const db = createConnection(join(dir, 'wire.sqlite'));
  runMigrations(db);
  const configPath = join(dir, 'config.json');
  const writeConfig = () => {
    writeFileSync(configPath, JSON.stringify(WIRE_CONFIG, null, 2), 'utf8');
  };
  writeConfig();

  const state: WireState = { ...DEFAULT_WIRE_STATE };
  const config = runnerConfigSchema.parse(WIRE_CONFIG);
  const app = createServer({
    db,
    scheduler: stubScheduler(state),
    getConfig: () => config,
    descriptor: createRunnerDescriptor(),
    logConfig: { level: 'silent' },
    configPath,
  });
  await app.ready();

  return {
    app,
    state,
    db,
    dir,
    reset: () => {
      Object.assign(state, DEFAULT_WIRE_STATE, {
        running: [],
        failedRegistrations: [],
      });
      writeConfig();
      resetWireDb(db);
    },
    close: async () => {
      await app.close();
      closeConnection(db);
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
