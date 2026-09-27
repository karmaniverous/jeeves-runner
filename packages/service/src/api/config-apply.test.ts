/**
 * Regression tests for how POST /config/apply resolves the config path.
 *
 * @remarks
 * Reproduces the e2e failure: the service was started with an absolute
 * `--config` path, but core was initialised with a relative config root.
 * The apply handler therefore derived `config/jeeves-runner/config.json`
 * relative to the process cwd and failed with ENOENT writing its temp file.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { init, resetInit } from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createRouteTestHarness,
  type RouteTestHarness,
} from '../test-utils/routes.js';

describe('POST /config/apply config path', () => {
  let configDir: string;
  let cwdDir: string;
  let configPath: string;
  let originalCwd: string;
  let harness: RouteTestHarness | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    configDir = mkdtempSync(join(tmpdir(), 'jr-apply-config-'));
    cwdDir = mkdtempSync(join(tmpdir(), 'jr-apply-cwd-'));
    configPath = join(configDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ port: 1937 }, null, 2));

    // Same state as the e2e: relative config root, no registered path,
    // and a cwd unrelated to the config file.
    process.chdir(cwdDir);
    init({ workspacePath: '.', configRoot: 'config' });
  });

  afterEach(async () => {
    await harness?.app.close();
    harness?.testDb.cleanup();
    harness = undefined;
    resetInit();
    process.chdir(originalCwd);
    rmSync(configDir, { recursive: true, force: true });
    rmSync(cwdDir, { recursive: true, force: true });
  });

  it('writes the patch to the explicit config file, not relative to cwd', async () => {
    harness = await createRouteTestHarness({ configPath });

    const response = await harness.app.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { port: 4242 } },
    });

    expect(response.statusCode).toBe(200);
    const written = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      port: number;
    };
    expect(written.port).toBe(4242);

    // Nothing is created relative to cwd, and no temp file is left
    // next to the config.
    expect(existsSync(join(cwdDir, 'config'))).toBe(false);
    expect(readdirSync(configDir)).toEqual(['config.json']);
  });

  it('returns 500 ENOENT without an explicit path when the derived dir is missing', async () => {
    harness = await createRouteTestHarness();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { port: 4242 } },
    });

    // Pins the pre-fix failure this regression guards against.
    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('ENOENT');
  });

  it('falls back to the derived path when no explicit path is given', async () => {
    mkdirSync(join(cwdDir, 'config', 'jeeves-runner'), { recursive: true });
    harness = await createRouteTestHarness();

    const response = await harness.app.inject({
      method: 'POST',
      url: '/config/apply',
      payload: { patch: { port: 4343 } },
    });

    expect(response.statusCode).toBe(200);
    const derived = join(cwdDir, 'config', 'jeeves-runner', 'config.json');
    const written = JSON.parse(readFileSync(derived, 'utf-8')) as {
      port: number;
    };
    expect(written.port).toBe(4343);
  });
});
