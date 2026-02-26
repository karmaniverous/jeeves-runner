/**
 * Tests for CLI commands (actual behavior, not just croner).
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestDb } from '../../test-utils/db.js';
import { createTestDb } from '../../test-utils/db.js';

describe('CLI', () => {
  let testDb: TestDb;
  let configPath: string;

  beforeEach(() => {
    testDb = createTestDb();
    configPath = `${testDb.dbPath}.config.json`;
    writeFileSync(
      configPath,
      JSON.stringify({
        dbPath: testDb.dbPath,
        port: 18780,
      }),
    );
  });

  afterEach(() => {
    testDb.cleanup();
    try {
      require('node:fs').unlinkSync(configPath);
    } catch {
      // Ignore
    }
  });

  it('should list jobs when database is empty', () => {
    const result = execSync(
      `node dist/cli/jeeves-runner/index.js list-jobs --config "${configPath}"`,
      { encoding: 'utf-8' },
    );
    expect(result).toContain('No jobs configured');
  });

  it('should add a valid job', () => {
    const result = execSync(
      `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test Job" --schedule "0 0 * * *" --script "echo test"`,
      { encoding: 'utf-8' },
    );
    expect(result).toContain("Job 'test-job' added");

    // Verify job was added
    const jobs = testDb.db
      .prepare('SELECT id, name FROM jobs')
      .all() as Array<{ id: string; name: string }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('test-job');
  });

  it('should reject invalid schedule in add-job', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "invalid" --script "echo test"`,
        { encoding: 'utf-8' },
      );
    }).toThrow();
  });

  it('should reject invalid overlap policy', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --overlap queue`,
        { encoding: 'utf-8' },
      );
    }).toThrow();
  });

  it('should reject invalid job type', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --type invalid`,
        { encoding: 'utf-8' },
      );
    }).toThrow();
  });

  it('should list jobs after adding one', () => {
    execSync(
      `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test Job" --schedule "0 0 * * *" --script "echo test"`,
    );

    const result = execSync(
      `node dist/cli/jeeves-runner/index.js list-jobs --config "${configPath}"`,
      { encoding: 'utf-8' },
    );
    expect(result).toContain('test-job');
    expect(result).toContain('Test Job');
    expect(result).toContain('0 0 * * *');
  });
});
