#!/usr/bin/env node
/**
 * CLI entry point for jeeves-runner.
 *
 * @module
 */

import { Command } from '@commander-js/extra-typings';

const program = new Command();

program
  .name('jeeves-runner')
  .description('Graph-aware job execution engine with SQLite state')
  .version('0.7.0');

program
  .command('start')
  .description('Start the runner daemon')
  .option('-c, --config <path>', 'Path to config file')
  .action((options) => {
    console.log('Starting runner with config:', options.config ?? 'default');
    // Implementation pending
  });

program
  .command('status')
  .description('Show runner status')
  .action(() => {
    console.log('Checking runner status...');
    // Implementation pending
  });

program
  .command('add-job')
  .description('Add a new job')
  .requiredOption('-i, --id <id>', 'Job ID')
  .requiredOption('-n, --name <name>', 'Job name')
  .requiredOption('-s, --schedule <schedule>', 'Cron schedule')
  .requiredOption('--script <script>', 'Script to execute')
  .action((options) => {
    console.log('Adding job:', options);
    // Implementation pending
  });

program
  .command('list-jobs')
  .description('List all jobs')
  .action(() => {
    console.log('Listing jobs...');
    // Implementation pending
  });

program
  .command('trigger')
  .description('Manually trigger a job')
  .requiredOption('-i, --id <id>', 'Job ID to trigger')
  .action((options) => {
    console.log('Triggering job:', options.id);
    // Implementation pending
  });

program.parse();
