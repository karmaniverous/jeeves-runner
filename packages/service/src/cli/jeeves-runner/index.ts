/**
 * CLI entry point for jeeves-runner.
 *
 * Uses `createServiceCli(descriptor)` from core for standard commands
 * (start, status, config, init, service). Adds custom commands for
 * job management (add-job, list-jobs, trigger, sync-jobs).
 *
 * @module
 */

import { resolve } from 'node:path';

import {
  createServiceCli,
  getServiceUrl,
  init,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';

import { createRunnerDescriptor } from '../../descriptor.js';
import { validateSchedule } from '../../scheduler/schedule-utils.js';
import { loadConfig, withDb } from './config-helpers.js';
import { syncJobsCommand } from './sync-command.js';

const descriptor = createRunnerDescriptor({
  customCliCommands: (program) => {
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

          withDb(config.dbPath, (db) => {
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
          });
        },
      );

    program
      .command('list-jobs')
      .description('List all jobs')
      .option('-c, --config <path>', 'Path to config file')
      .action((options: { config?: string }) => {
        const config = loadConfig(options.config);
        withDb(config.dbPath, (db) => {
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
        });
      });

    program
      .command('trigger')
      .description('Manually trigger a job')
      .requiredOption('-i, --id <id>', 'Job ID to trigger')
      .option(
        '-w, --workspace <path>',
        'Workspace root path',
        WORKSPACE_CONFIG_DEFAULTS.core.workspace,
      )
      .option(
        '--config-root <path>',
        'Platform config root path',
        WORKSPACE_CONFIG_DEFAULTS.core.configRoot,
      )
      .action(
        (options: { id: string; workspace: string; configRoot: string }) => {
          init({
            workspacePath: options.workspace,
            configRoot: options.configRoot,
          });
          const url = getServiceUrl('runner');
          void (async () => {
            try {
              const resp = await fetch(`${url}/jobs/${options.id}/run`, {
                method: 'POST',
              });
              const text = await resp.text();
              if (!resp.ok) {
                // 404 unknown job, 409 at maxConcurrency, 500 other (#118).
                // The body may be empty or non-JSON; report it verbatim.
                console.error(
                  `Trigger failed (HTTP ${String(resp.status)}): ${text}`,
                );
                process.exit(1);
              }
              const result = JSON.parse(text) as Record<string, unknown>;
              console.log(JSON.stringify(result, null, 2));
            } catch {
              console.error(`Runner not reachable at ${url}. Is it running?`);
              process.exit(1);
            }
          })();
        },
      );

    program
      .command('sync-jobs')
      .description(
        'Sync job definitions from jeeves-scripts (list --json) or legacy JSON files into the database',
      )
      .option('-c, --config <path>', 'Path to config file')
      .option(
        '--scripts-dir <dir>',
        'jeeves-scripts repo dir (overrides config scriptsDir)',
      )
      .option(
        '--jobs-dir <dir>',
        'Legacy jobs directory (deprecated; overrides config jobsDir)',
      )
      .option('--dry-run', 'Report what would change without writing')
      .option(
        '--reset-enabled',
        'Overwrite enabled on existing jobs with the source value',
      )
      .option(
        '--prune',
        'Disable launcher jobs no longer listed (never deletes)',
      )
      .option(
        '-w, --workspace <path>',
        'Workspace root path',
        WORKSPACE_CONFIG_DEFAULTS.core.workspace,
      )
      .option(
        '--config-root <path>',
        'Platform config root path',
        WORKSPACE_CONFIG_DEFAULTS.core.configRoot,
      )
      .action(syncJobsCommand);
  },
});

createServiceCli(descriptor).parse();
