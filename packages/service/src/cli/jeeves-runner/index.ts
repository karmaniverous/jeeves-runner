/**
 * CLI entry point for jeeves-runner.
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Command } from 'commander';
import { CronPattern } from 'croner';

import { createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { createRunner } from '../../runner.js';
import { runnerConfigSchema } from '../../schemas/config.js';
import { registerServiceCommand } from './commands/service.js';

/** Options shared by commands that accept --config. */
interface ConfigOptions {
  config?: string;
}

/** Options for the add-job command. */
interface AddJobOptions extends ConfigOptions {
  id: string;
  name: string;
  schedule: string;
  script: string;
  type: string;
  description?: string;
  timeout?: string;
  overlap: string;
  onFailure?: string;
  onSuccess?: string;
}

/** Options for the trigger command. */
interface TriggerOptions extends ConfigOptions {
  id: string;
}

/** Load and validate config from a JSON file path, or return defaults. */
function loadConfig(configPath?: string) {
  if (configPath) {
    const raw = readFileSync(resolve(configPath), 'utf-8');
    return runnerConfigSchema.parse(JSON.parse(raw));
  }
  return runnerConfigSchema.parse({});
}

const program = new Command();

program
  .name('jeeves-runner')
  .description('Graph-aware job execution engine with SQLite state')
  .version('0.0.0');

program
  .command('start')
  .description('Start the runner daemon')
  .option('-c, --config <path>', 'Path to config file')
  .action((options: ConfigOptions) => {
    const config = loadConfig(options.config);
    const runner = createRunner(config);
    void runner.start();
  });

program
  .command('status')
  .description('Show runner status')
  .option('-c, --config <path>', 'Path to config file')
  .action((options: ConfigOptions) => {
    const config = loadConfig(options.config);
    void (async () => {
      try {
        const resp = await fetch(
          `http://127.0.0.1:${String(config.port)}/stats`,
        );
        const stats = (await resp.json()) as Record<string, unknown>;
        console.log(JSON.stringify(stats, null, 2));
      } catch {
        console.error(
          `Runner not reachable on port ${String(config.port)}. Is it running?`,
        );
        process.exit(1);
      }
    })();
  });

program
  .command('add-job')
  .description('Add a new job')
  .requiredOption('-i, --id <id>', 'Job ID')
  .requiredOption('-n, --name <name>', 'Job name')
  .requiredOption('-s, --schedule <schedule>', 'Cron schedule')
  .requiredOption('--script <script>', 'Absolute path to script')
  .option('-t, --type <type>', 'Job type (script|session)', 'script')
  .option('-d, --description <desc>', 'Job description')
  .option('--timeout <ms>', 'Timeout in ms')
  .option('--overlap <policy>', 'Overlap policy (skip|allow)', 'skip')
  .option('--on-failure <channel>', 'Slack channel for failure alerts')
  .option('--on-success <channel>', 'Slack channel for success alerts')
  .option('-c, --config <path>', 'Path to config file')
  .action((options: AddJobOptions) => {
    const config = loadConfig(options.config);

    // Validate schedule expression before inserting
    try {
      new CronPattern(options.schedule);
    } catch (err) {
      console.error(
        `Invalid schedule expression: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    // Validate overlap_policy
    if (!['skip', 'allow'].includes(options.overlap)) {
      console.error(
        `Invalid overlap policy '${options.overlap}'. Supported values: skip, allow`,
      );
      process.exit(1);
    }

    // Validate job type
    if (!['script', 'session'].includes(options.type)) {
      console.error(
        `Invalid job type '${options.type}'. Supported values: script, session`,
      );
      process.exit(1);
    }

    const db = createConnection(config.dbPath);
    runMigrations(db);

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, type, description, timeout_ms, overlap_policy, on_failure, on_success)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      options.id,
      options.name,
      options.schedule,
      resolve(options.script),
      options.type,
      options.description ?? null,
      options.timeout ? parseInt(options.timeout, 10) : null,
      options.overlap,
      options.onFailure ?? null,
      options.onSuccess ?? null,
    );

    console.log(`Job '${options.id}' added.`);
    db.close();
  });

program
  .command('list-jobs')
  .description('List all jobs')
  .option('-c, --config <path>', 'Path to config file')
  .action((options: ConfigOptions) => {
    const config = loadConfig(options.config);
    const db = createConnection(config.dbPath);
    runMigrations(db);

    const rows = db
      .prepare('SELECT id, name, schedule, enabled FROM jobs')
      .all() as Array<{
      id: string;
      name: string;
      schedule: string;
      enabled: number;
    }>;

    if (rows.length === 0) {
      console.log('No jobs configured.');
    } else {
      for (const row of rows) {
        const status = row.enabled ? '✅' : '⏸️';
        console.log(`${status} ${row.id}  ${row.schedule}  ${row.name}`);
      }
    }
    db.close();
  });

program
  .command('trigger')
  .description('Manually trigger a job')
  .requiredOption('-i, --id <id>', 'Job ID to trigger')
  .option('-c, --config <path>', 'Path to config file')
  .action((options: TriggerOptions) => {
    const config = loadConfig(options.config);
    void (async () => {
      try {
        const resp = await fetch(
          `http://127.0.0.1:${String(config.port)}/jobs/${options.id}/run`,
          { method: 'POST' },
        );
        const result = (await resp.json()) as Record<string, unknown>;
        console.log(JSON.stringify(result, null, 2));
      } catch {
        console.error(
          `Runner not reachable on port ${String(config.port)}. Is it running?`,
        );
        process.exit(1);
      }
    })();
  });

registerServiceCommand(program);

program.parse();
