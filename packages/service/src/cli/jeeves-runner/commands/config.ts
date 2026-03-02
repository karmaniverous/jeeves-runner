/**
 * @module commands/config
 *
 * CLI commands: validate, init, config show.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Command } from 'commander';

import { runnerConfigSchema } from '../../../schemas/config.js';

/** Minimal starter config template. */
const INIT_CONFIG_TEMPLATE = {
  port: 1937,
  dbPath: './data/runner.sqlite',
  maxConcurrency: 4,
  runRetentionDays: 30,
  log: {
    level: 'info',
  },
  notifications: {
    slackTokenPath: '',
    defaultOnFailure: null,
    defaultOnSuccess: null,
  },
  gateway: {
    url: 'http://127.0.0.1:18789',
    tokenPath: '',
  },
};

/** Register config-related commands on the CLI. */
export function registerConfigCommands(cli: Command): void {
  cli
    .command('validate')
    .description('Validate a configuration file against the schema')
    .requiredOption('-c, --config <path>', 'Path to configuration file')
    .action((options: { config: string }) => {
      try {
        const raw = readFileSync(resolve(options.config), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const config = runnerConfigSchema.parse(parsed);

        console.log('✅ Config valid');
        console.log(`  Port: ${String(config.port)}`);
        console.log(`  Database: ${config.dbPath}`);
        console.log(`  Max concurrency: ${String(config.maxConcurrency)}`);
        console.log(`  Run retention: ${String(config.runRetentionDays)} days`);
        console.log(`  Log level: ${config.log.level}`);
        if (config.log.file) {
          console.log(`  Log file: ${config.log.file}`);
        }
        if (config.notifications.slackTokenPath) {
          console.log(
            `  Slack notifications: ${config.notifications.defaultOnFailure ? 'configured' : 'token set, no default channel'}`,
          );
        }
        if (config.gateway.tokenPath) {
          console.log(`  Gateway: ${config.gateway.url}`);
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.error(`❌ Invalid JSON: ${error.message}`);
        } else {
          console.error('❌ Config invalid:', error);
        }
        process.exit(1);
      }
    });

  cli
    .command('init')
    .description('Generate a starter configuration file')
    .option(
      '-o, --output <path>',
      'Output config file path',
      'jeeves-runner.config.json',
    )
    .action((options: { output: string }) => {
      const outputPath = resolve(options.output);

      try {
        readFileSync(outputPath);
        console.error(`❌ File already exists: ${outputPath}`);
        console.error('   Remove it first or choose a different path with -o');
        process.exit(1);
      } catch {
        // File doesn't exist, good
      }

      writeFileSync(
        outputPath,
        JSON.stringify(INIT_CONFIG_TEMPLATE, null, 2) + '\n',
      );
      console.log(`✅ Wrote ${outputPath}`);
      console.log();
      console.log('Next steps:');
      console.log(
        '  1. Edit the config file to set your paths and preferences',
      );
      console.log('  2. Validate: jeeves-runner validate -c ' + options.output);
      console.log('  3. Start: jeeves-runner start -c ' + options.output);
    });

  cli
    .command('config-show')
    .description(
      'Show the resolved configuration (defaults applied, secrets redacted)',
    )
    .requiredOption('-c, --config <path>', 'Path to configuration file')
    .action((options: { config: string }) => {
      try {
        const raw = readFileSync(resolve(options.config), 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        const config = runnerConfigSchema.parse(parsed);

        // Redact sensitive paths
        const redacted = {
          ...config,
          notifications: {
            ...config.notifications,
            slackTokenPath: config.notifications.slackTokenPath
              ? '***'
              : undefined,
          },
          gateway: {
            ...config.gateway,
            tokenPath: config.gateway.tokenPath ? '***' : undefined,
          },
        };

        console.log(JSON.stringify(redacted, null, 2));
      } catch (error) {
        if (error instanceof SyntaxError) {
          console.error(`❌ Invalid JSON: ${error.message}`);
        } else {
          console.error('❌ Config invalid:', error);
        }
        process.exit(1);
      }
    });
}
