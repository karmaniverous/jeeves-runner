/**
 * Service entry point. Loads config and starts the runner.
 * Usage: node bin/start.js --config <path>
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRunner } from '../dist/mjs/index.js';
import { runnerConfigSchema } from '../dist/mjs/index.js';

const configIdx = process.argv.indexOf('--config');
const configPath = configIdx >= 0 ? process.argv[configIdx + 1] : undefined;

if (!configPath) {
  console.error('Usage: node bin/start.js --config <path>');
  process.exit(1);
}

const raw = readFileSync(resolve(configPath), 'utf-8');
const config = runnerConfigSchema.parse(JSON.parse(raw));
const runner = createRunner(config);
await runner.start();
