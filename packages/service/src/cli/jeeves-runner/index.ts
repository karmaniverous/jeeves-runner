/**
 * CLI entry point for jeeves-runner.
 *
 * Uses `createServiceCli(descriptor)` from core for standard commands
 * (start, status, config, init, service). Adds custom commands for
 * job management (add-job, list-jobs, trigger).
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createServiceCli } from '@karmaniverous/jeeves';
import type { Command as BaseCommand } from 'commander';

import { createConnection } from '../../db/connection.js';
import { runMigrations } from '../../db/migrations.js';
import { createRunnerDescriptor } from '../../descriptor.js';
import { validateSchedule } from '../../scheduler/schedule-utils.js';
import { runnerConfigSchema } from '../../schemas/config.js';

/** Load and validate config from a JSON file path, or return defaults. */
function loadConfig(configPath?: string) {
  if (configPath) {
    const raw = readFileSync(resolve(configPath), 'utf-8');
    return runnerConfigSchema.parse(JSON.parse(raw));
  }
  return runnerConfigSchema.parse({});
}

const descriptor = createRunnerDescriptor({
  customCliCommands: (program: BaseCommand) => {
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
      .action(
        (options: {
          id: string;
          name: string;
          schedule: string;
          script: string;
          type: string;
          description?: string;
          timeout?: string;
          overlap: string;
          config?: string;
          onFailure?: string;
          onSuccess?: string;
        }) => {
          const config = loadConfig(options.config);
          const scheduleResult = validateSchedule(options.schedule);
          if (!scheduleResult.valid) {
            console.error(`Invalid schedule: ${scheduleResult.error}`);
            process.exit(1);
          }
          if (!['skip', 'allow'].includes(options.overlap)) {
            console.error(
              `Invalid overlap policy '${options.overlap}'. Supported: skip, allow`,
            );
            process.exit(1);
          }
          if (!['script', 'session'].includes(options.type)) {
            console.error(
              `Invalid job type '${options.type}'. Supported: script, session`,
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
        },
      );

    program
      .command('list-jobs')
      .description('List all jobs')
      .option('-c, --config <path>', 'Path to config file')
      .action((options: { config?: string }) => {
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
            const status = row.enabled ? '\u2705' : '\u23F8\uFE0F';
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
      .action((options: { id: string; config?: string }) => {
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
  },
});

// Type assertion bridges @commander-js/extra-typings Command (core dep)
// with the base commander types in this package.
const program = createServiceCli(descriptor) as unknown as {
  parse: (argv?: string[]) => void;
};

program.parse();
