/**
 * Tests for CLI commands (actual behavior, not just croner).
 */

import { exec, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestDb } from '../../test-utils/db.js';
import { createTestDb } from '../../test-utils/db.js';

describe('CLI', () => {
  vi.setConfig({ testTimeout: 15000 });
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
      unlinkSync(configPath);
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
    const jobs = testDb.db.prepare('SELECT id, name FROM jobs').all() as Array<{
      id: string;
      name: string;
    }>;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.id).toBe('test-job');
  });

  it('should reject invalid schedule in add-job', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "invalid" --script "echo test"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should reject invalid overlap policy', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --overlap queue`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should reject invalid job type', () => {
    expect(() => {
      execSync(
        `node dist/cli/jeeves-runner/index.js add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --type invalid`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should list jobs after adding one', { timeout: 15000 }, () => {
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

const execAsync = promisify(exec);

describe('trigger command', () => {
  vi.setConfig({ testTimeout: 15000 });

  it('should POST to /jobs/:id/run on the resolved service URL', async () => {
    // Start a mock HTTP server that records incoming requests.
    let receivedPath = '';
    let receivedMethod = '';
    const server: Server = createServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'triggered' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const mockPort = (server.address() as AddressInfo).port;

    try {
      // Create a config-root with jeeves-core/config.json that points
      // getServiceUrl('runner') at our mock server.
      const configRoot = mkdtempSync(join(tmpdir(), 'trigger-test-'));
      const coreDir = join(configRoot, 'jeeves-core');
      mkdirSync(coreDir, { recursive: true });
      writeFileSync(
        join(coreDir, 'config.json'),
        JSON.stringify({
          services: {
            runner: { url: `http://127.0.0.1:${String(mockPort)}` },
          },
        }),
      );

      const { stdout } = await execAsync(
        `node dist/cli/jeeves-runner/index.js trigger --id my-job --config-root "${configRoot}"`,
        { encoding: 'utf-8', timeout: 10000 },
      );

      expect(receivedMethod).toBe('POST');
      expect(receivedPath).toBe('/jobs/my-job/run');
      expect(stdout).toContain('triggered');
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  }, 15000);
});

describe('init-scripts command', () => {
  it('should reference jeeves-scripts-template in help text', () => {
    const result = execSync(
      'node dist/cli/jeeves-runner/index.js init-scripts --help',
      { encoding: 'utf-8' },
    );
    expect(result).toContain('jeeves-scripts-template');
  });
});

describe('shared CLI config flags', () => {
  it('trigger accepts --workspace and --config-root without error', () => {
    // Using --help to avoid actual execution; flags must be recognized.
    const result = execSync(
      'node dist/cli/jeeves-runner/index.js trigger --help',
      { encoding: 'utf-8' },
    );
    expect(result).toContain('--workspace');
    expect(result).toContain('--config-root');
  });

  it('init-scripts accepts --workspace and --config-root without error', () => {
    const result = execSync(
      'node dist/cli/jeeves-runner/index.js init-scripts --help',
      { encoding: 'utf-8' },
    );
    expect(result).toContain('--workspace');
    expect(result).toContain('--config-root');
  });
});
