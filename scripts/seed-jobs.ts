#!/usr/bin/env npx tsx
/**
 * Seed the 27 existing jobs into jeeves-runner's SQLite database.
 * Run once during initial migration.
 *
 * Usage: npx tsx scripts/seed-jobs.ts [--config path/to/config.json]
 */

import { readFileSync } from 'node:fs';

import { createConnection } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations.js';
import { runnerConfigSchema } from '../src/schemas/config.js';

// Default failure channel: Jason's DM
const JASON_DM = 'D0AB0NJ96H3';

// Prime-minute intervals for rotation jobs (ascending primes)
const PRIMES = [
  5, 11, 17, 23, 29, 37, 41, 47, 53, 59, 67, 71, 79, 83, 89, 97, 101, 107, 113,
  127, 131, 137, 149, 157,
];

interface JobDef {
  id: string;
  name: string;
  schedule: string;
  script: string;
  type: 'script' | 'session';
  description?: string;
}

// Fixed-schedule jobs
const fixedJobs: JobDef[] = [
  {
    id: 'generate-daily-digest',
    name: 'Generate Daily Digest',
    schedule: '0 23 * * *',
    script: 'D:/.jeeves/core/dispatchers/generate-daily-digest.js',
    type: 'session',
    description: 'Generate the daily digest via LLM synthesis',
  },
  {
    id: 'generate-social-posts',
    name: 'Generate Social Posts',
    schedule: '0 23 * * *',
    script: 'D:/.jeeves/core/dispatchers/generate-social-posts.js',
    type: 'session',
    description: 'Generate social media posts via LLM synthesis',
  },
  {
    id: 'rebuild-tinypoe',
    name: 'Rebuild tinypoe.ms',
    schedule: '0 */6 * * *',
    script: 'J:/domains/x/run-backfill-and-sync.cmd',
    type: 'script',
    description: 'Rebuild tinypoe.ms static site',
  },
];

// Rotation jobs in order (matched to prime intervals)
const rotationJobs: Array<Omit<JobDef, 'schedule'>> = [
  {
    id: 'drain-email-updates',
    name: 'Drain Email Update Queue',
    script: 'D:/.jeeves/core/email/drain-updates.js',
    type: 'script',
  },
  {
    id: 'poll-email',
    name: 'Poll Email',
    script: 'D:/.jeeves/core/email/poll.js',
    type: 'script',
  },
  {
    id: 'download-email',
    name: 'Download Email',
    script: 'D:/.jeeves/core/email/download.js',
    type: 'script',
  },
  {
    id: 'sync-gh-repos',
    name: 'Sync GH Repos',
    script: 'D:/.jeeves/core/scripts/sync-static-repos.js',
    type: 'script',
  },
  {
    id: 'sync-gh-issues',
    name: 'Sync GH Issues',
    script: 'powershell -File D:/.jeeves/core/scripts/sync-issues.ps1',
    type: 'script',
  },
  {
    id: 'poll-x-posts',
    name: 'Poll X Posts',
    script: 'J:/domains/x/queue/poll.js',
    type: 'script',
  },
  {
    id: 'extract-email-meetings',
    name: 'Extract Email Meetings',
    script: 'D:/.jeeves/core/email/meetings-v3.js',
    type: 'script',
  },
  {
    id: 'ingest-notion-inbox-meeting',
    name: 'Ingest Notion Inbox Meeting',
    script: 'D:/.jeeves/core/dispatchers/ingest-notion-inbox-meeting.js',
    type: 'session',
  },
  {
    id: 'pull-gh-repos',
    name: 'Pull GH Repos',
    script: 'D:/.jeeves/core/codebase/shallow-sweep.js',
    type: 'script',
  },
  {
    id: 'update-gh-repo-meta',
    name: 'Update GH Repo Meta',
    script: 'D:/.jeeves/core/dispatchers/update-gh-repo-meta.js',
    type: 'session',
  },
  {
    id: 'fetch-meeting-notes',
    name: 'Fetch Meeting Notes',
    script: 'D:/.jeeves/core/dispatchers/fetch-meeting-notes.js',
    type: 'session',
  },
  {
    id: 'poll-slack-messages',
    name: 'Poll Slack Messages',
    script: 'J:/domains/slack/.domain/poll.js',
    type: 'script',
  },
  {
    id: 'poll-gh-notifications',
    name: 'Poll GH Notifications',
    script: 'D:/.jeeves/core/github/watch/watch.js',
    type: 'script',
  },
  {
    id: 'build-gh-repo-registry',
    name: 'Build GH Repo Registry',
    script: 'D:/.jeeves/core/codebase/build-registry.cmd',
    type: 'script',
  },
  {
    id: 'drain-x-post-queue',
    name: 'Drain X Post Queue',
    script: 'J:/domains/x/queue/process.js',
    type: 'script',
  },
  {
    id: 'update-gh-repo-global-meta',
    name: 'Update GH Repo Global Meta',
    script: 'D:/.jeeves/core/dispatchers/update-gh-repo-global-meta.js',
    type: 'session',
  },
  {
    id: 'update-slack-meta',
    name: 'Update Slack Meta',
    script: 'D:/.jeeves/core/dispatchers/update-slack-meta.js',
    type: 'session',
  },
  {
    id: 'update-email-meta',
    name: 'Update Email Meta',
    script: 'D:/.jeeves/core/dispatchers/update-email-meta.js',
    type: 'session',
  },
  {
    id: 'update-x-meta',
    name: 'Update X Meta',
    script: 'D:/.jeeves/core/dispatchers/update-x-meta.js',
    type: 'session',
  },
  {
    id: 'update-meetings-meta',
    name: 'Update Meetings Meta',
    script: 'D:/.jeeves/core/dispatchers/update-meetings-meta.js',
    type: 'session',
  },
  {
    id: 'update-project-meta',
    name: 'Update Project Meta',
    script: 'D:/.jeeves/core/dispatchers/update-project-meta.js',
    type: 'session',
  },
  {
    id: 'update-global-meta',
    name: 'Update Global Meta',
    script: 'D:/.jeeves/core/dispatchers/update-global-meta.js',
    type: 'session',
  },
  {
    id: 'poll-gh-repo-collabs',
    name: 'Poll GH Repo Collabs',
    script: 'J:/domains/github/queues/collab/poll.js',
    type: 'script',
  },
  {
    id: 'drain-gh-collab-queue',
    name: 'Drain GH Collab Queue',
    script: 'J:/domains/github/queues/collab/process.js',
    type: 'script',
  },
];

// Build all jobs with schedules
const allJobs: JobDef[] = [
  ...fixedJobs,
  ...rotationJobs.map((job, i) => ({
    ...job,
    schedule: `*/${String(PRIMES[i])} * * * *`,
  })),
];

// Load config
const configArg = process.argv.indexOf('--config');
const configPath = configArg >= 0 ? process.argv[configArg + 1] : undefined;
const config = configPath
  ? runnerConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf-8')))
  : runnerConfigSchema.parse({});

// Open DB and seed
const db = createConnection(config.dbPath);
runMigrations(db);

const insertStmt = db.prepare(
  `INSERT OR IGNORE INTO jobs (id, name, schedule, script, type, description, on_failure)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

let inserted = 0;
for (const job of allJobs) {
  const result = insertStmt.run(
    job.id,
    job.name,
    job.schedule,
    job.script,
    job.type,
    job.description ?? null,
    JASON_DM,
  );
  if (result.changes > 0) inserted++;
}

console.log(
  `Seeded ${String(inserted)} jobs (${String(allJobs.length)} total, ${String(allJobs.length - inserted)} already existed).`,
);
db.close();
