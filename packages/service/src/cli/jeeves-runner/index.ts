/**
 * CLI entry point for jeeves-runner.
 *
 * Uses `createServiceCli(descriptor)` from core for standard commands
 * (start, status, config, init, service). Adds custom commands for
 * job management (add-job, list-jobs, trigger).
 *
 * @module
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import {
  createServiceCli,
  getComponentConfigDir,
  getServiceUrl,
  init,
  WORKSPACE_CONFIG_DEFAULTS,
} from '@karmaniverous/jeeves';
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

/** Open a migrated DB connection, run `fn`, then close. */
function withDb<T>(
  dbPath: string,
  fn: (db: ReturnType<typeof createConnection>) => T,
): T {
  const db = createConnection(dbPath);
  runMigrations(db);
  try {
    return fn(db);
  } finally {
    db.close();
  }
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
              const result = (await resp.json()) as Record<string, unknown>;
              console.log(JSON.stringify(result, null, 2));
            } catch {
              console.error(`Runner not reachable at ${url}. Is it running?`);
              process.exit(1);
            }
          })();
        },
      );

    program
      .command('init-scripts')
      .description(
        'Clone jeeves-scripts-template into scripts/ and configure tsx runner',
      )
      .option('-c, --config <path>', 'Path to config file')
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
        (options: {
          config?: string;
          workspace: string;
          configRoot: string;
        }) => {
          init({
            workspacePath: options.workspace,
            configRoot: options.configRoot,
          });
          const configDir = options.config
            ? dirname(resolve(options.config))
            : getComponentConfigDir('runner');
          const configPath = options.config
            ? resolve(options.config)
            : join(configDir, 'config.json');
          const scriptsDir = join(configDir, 'scripts');

          if (existsSync(scriptsDir)) {
            console.error(`Scripts directory already exists: ${scriptsDir}`);
            process.exit(1);
          }

          console.log(`Cloning scripts template into ${scriptsDir}...`);
          execSync(
            `git clone https://github.com/karmaniverous/jeeves-scripts-template.git "${scriptsDir}"`,
            { stdio: 'inherit' },
          );

          console.log('Installing dependencies...');
          execSync('npm install', { cwd: scriptsDir, stdio: 'inherit' });

          const tsxPath = join(
            scriptsDir,
            'node_modules',
            'tsx',
            'dist',
            'cli.mjs',
          );
          const tsRunner = `node ${tsxPath}`;

          if (existsSync(configPath)) {
            const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<
              string,
              unknown
            >;
            const runners = (raw.runners ?? {}) as Record<string, string>;
            runners.ts = tsRunner;
            raw.runners = runners;
            writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n');
            console.log(`Updated runners.ts in ${configPath}`);
          } else {
            const template = { runners: { ts: tsRunner } };
            writeFileSync(configPath, JSON.stringify(template, null, 2) + '\n');
            console.log(`Created config with runners.ts at ${configPath}`);
          }

          console.log('Scripts initialized successfully.');
        },
      );
  },
});

// Type assertion bridges @commander-js/extra-typings Command (core dep)
// with the base commander types in this package.
const program = createServiceCli(descriptor) as {
  parse: (argv?: string[]) => void;
};

program.parse();
