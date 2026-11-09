/**
 * Tests for CLI commands (actual behavior, not just croner).
 */

import { exec, execSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestDb } from '../../test-utils/db.js';
import { createTestDb } from '../../test-utils/db.js';

/**
 * Run the CLI from source via tsx, never from build output (dist/). tsx
 * honours the tsconfig `paths` mapping, so workspace packages resolve to
 * source as well.
 */
const CLI = `"${process.execPath}" --import tsx src/cli/jeeves-runner/index.ts`;

/** The environment without jeeves root variables, plus `extra`. */
function cliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  for (const name of ['JEEVES_CONFIG_ROOT', 'JEEVES_WORKSPACE']) {
    if (!(name in extra)) Reflect.deleteProperty(env, name);
  }
  return env;
}

/** Run the CLI, capturing exit status, stdout and stderr separately. */
function runCli(args: string, extraEnv: Record<string, string> = {}) {
  const res = spawnSync(`${CLI} ${args}`, {
    shell: true,
    encoding: 'utf-8',
    env: cliEnv(extraEnv),
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe('CLI config resolution (#122)', () => {
  vi.setConfig({ testTimeout: 15000 });
  let testDb: TestDb;

  beforeEach(() => {
    testDb = createTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('prints the absolute config and database paths to stderr only', () => {
    const configPath = `${testDb.dbPath}.config.json`;
    writeFileSync(configPath, JSON.stringify({ dbPath: testDb.dbPath }));

    const res = runCli(`list-jobs -c "${configPath}"`);

    expect(res.status).toBe(0);
    expect(res.stdout).toBe('No jobs configured.\n');
    expect(res.stderr).toContain(`Config: ${configPath}`);
    expect(res.stderr).toContain(`Database: ${testDb.dbPath}`);
  });

  it('finds {configRoot}/jeeves-runner/config.json through JEEVES_CONFIG_ROOT', () => {
    const configRoot = mkdtempSync(join(tmpdir(), 'cli-root-'));
    mkdirSync(join(configRoot, 'jeeves-runner'));
    writeFileSync(
      join(configRoot, 'jeeves-runner', 'config.json'),
      JSON.stringify({ dbPath: testDb.dbPath }),
    );

    const res = runCli(
      'add-job --id env-job --name "Env Job" --schedule "0 0 * * *" --script x.js',
      { JEEVES_CONFIG_ROOT: configRoot },
    );

    expect(res.status).toBe(0);
    expect(testDb.db.prepare('SELECT id FROM jobs').all()).toEqual([
      { id: 'env-job' },
    ]);
  });

  it.each(['list-jobs', 'sync-jobs --dry-run'])(
    '%s refuses without a config, naming the path, creating nothing',
    (command) => {
      const configRoot = mkdtempSync(join(tmpdir(), 'cli-empty-'));

      const res = runCli(`${command} --config-root "${configRoot}"`);

      expect(res.status).toBe(1);
      expect(res.stdout).toBe('');
      expect(res.stderr).toContain(
        `No jeeves-runner config found at ${join(configRoot, 'jeeves-runner', 'config.json')}.`,
      );
      expect(res.stderr).toContain('came from the --config-root flag.');
      expect(readdirSync(configRoot)).toEqual([]);
    },
  );
});

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
    const result = execSync(`${CLI} list-jobs --config "${configPath}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(result).toContain('No jobs configured');
  });

  it('should add a valid job', () => {
    const result = execSync(
      `${CLI} add-job --config "${configPath}" --id test-job --name "Test Job" --schedule "0 0 * * *" --script "echo test"`,
      { encoding: 'utf-8', stdio: 'pipe' },
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
        `${CLI} add-job --config "${configPath}" --id test-job --name "Test" --schedule "invalid" --script "echo test"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should reject invalid overlap policy', () => {
    expect(() => {
      execSync(
        `${CLI} add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --overlap queue`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should reject invalid job type', () => {
    expect(() => {
      execSync(
        `${CLI} add-job --config "${configPath}" --id test-job --name "Test" --schedule "0 0 * * *" --script "echo test" --type invalid`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    }).toThrow();
  });

  it('should list jobs after adding one', { timeout: 15000 }, () => {
    execSync(
      `${CLI} add-job --config "${configPath}" --id test-job --name "Test Job" --schedule "0 0 * * *" --script "echo test"`,
      { stdio: 'pipe' },
    );

    const result = execSync(`${CLI} list-jobs --config "${configPath}"`, {
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    expect(result).toContain('test-job');
    expect(result).toContain('Test Job');
    expect(result).toContain('0 0 * * *');
  });
});

const execAsync = promisify(exec);

describe('trigger command', () => {
  vi.setConfig({ testTimeout: 15000 });

  /** Run `trigger` against a mock runner answering with `status` and `body` (sent verbatim if a string). */
  async function triggerAgainst(
    status: number,
    body: unknown,
    via: 'flag' | 'env' = 'flag',
  ): Promise<{ method: string; path: string; stdout: string }> {
    let receivedPath = '';
    let receivedMethod = '';
    const server: Server = createServer((req, res) => {
      receivedMethod = req.method ?? '';
      receivedPath = req.url ?? '';
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
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

      // No jeeves-runner/config.json here: trigger needs none (DD#81).
      const { stdout } = await execAsync(
        via === 'flag'
          ? `${CLI} trigger --id my-job --config-root "${configRoot}"`
          : `${CLI} trigger --id my-job`,
        {
          encoding: 'utf-8',
          timeout: 10000,
          env: cliEnv(via === 'env' ? { JEEVES_CONFIG_ROOT: configRoot } : {}),
        },
      );
      return { method: receivedMethod, path: receivedPath, stdout };
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  }

  it('should POST to /jobs/:id/run on the resolved service URL', async () => {
    const { method, path, stdout } = await triggerAgainst(200, {
      status: 'triggered',
    });

    expect(method).toBe('POST');
    expect(path).toBe('/jobs/my-job/run');
    expect(stdout).toContain('triggered');
  }, 15000);

  it('resolves configRoot from JEEVES_CONFIG_ROOT when the flag is absent (#122)', async () => {
    const { path } = await triggerAgainst(200, { status: 'triggered' }, 'env');

    expect(path).toBe('/jobs/my-job/run');
  }, 15000);

  it('exits non-zero and reports the status when the runner refuses (#118)', async () => {
    await expect(
      triggerAgainst(409, { error: 'Max concurrency reached' }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Trigger failed (HTTP 409): {"error":"Max concurrency reached"}',
      ) as unknown,
    });
  }, 15000);

  it('reports the status for a non-JSON error body, not "not reachable" (#118)', async () => {
    await expect(triggerAgainst(502, 'Bad Gateway')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'Trigger failed (HTTP 502): Bad Gateway',
      ) as unknown,
    });
  }, 15000);
});

describe('removed commands', () => {
  it('init-scripts is no longer a command', () => {
    const help = execSync(`${CLI} --help`, { encoding: 'utf-8' });
    expect(help).not.toContain('init-scripts');
    expect(() =>
      execSync(`${CLI} init-scripts`, { encoding: 'utf-8', stdio: 'pipe' }),
    ).toThrow();
  });
});

describe('shared CLI config flags', () => {
  it.each(['add-job', 'list-jobs', 'trigger', 'sync-jobs'])(
    '%s takes --workspace and --config-root without commander defaults',
    (command) => {
      // --help avoids execution; the flags must be recognised, and a
      // commander default would hide env and jeeves.config.json (DD#81).
      const result = execSync(`${CLI} ${command} --help`, {
        encoding: 'utf-8',
      });
      expect(result).toContain('-w, --workspace <path>');
      expect(result).toContain('--config-root <path>');
      expect(result).not.toContain('(default: "./config")');
      expect(result).not.toContain('(default: ".")');
    },
  );
});
