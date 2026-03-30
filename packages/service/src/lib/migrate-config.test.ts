/**
 * Tests for config path migration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateConfig } from './migrate-config.js';

describe('migrateConfig', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'jr-migrate-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('migrates legacy config to new path layout', () => {
    const legacyPath = join(testDir, 'jeeves-runner.config.json');
    const config = { port: 1937, host: '127.0.0.1' };
    writeFileSync(legacyPath, JSON.stringify(config));

    const newConfigPath = join(testDir, 'jeeves-runner', 'config.json');
    const result = migrateConfig(newConfigPath);

    expect(result).toBe(true);
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(newConfigPath)).toBe(true);

    const migrated = JSON.parse(readFileSync(newConfigPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(migrated).toEqual(config);
  });

  it('is a no-op when new config already exists', () => {
    const legacyPath = join(testDir, 'jeeves-runner.config.json');
    writeFileSync(legacyPath, JSON.stringify({ old: true }));

    const newDir = join(testDir, 'jeeves-runner');
    mkdirSync(newDir, { recursive: true });
    const newConfigPath = join(newDir, 'config.json');
    writeFileSync(newConfigPath, JSON.stringify({ new: true }));

    const result = migrateConfig(newConfigPath);

    expect(result).toBe(false);
    // Both files still exist, new one unchanged
    expect(existsSync(legacyPath)).toBe(true);
    const current = JSON.parse(readFileSync(newConfigPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(current).toEqual({ new: true });
  });

  it('is a no-op when neither config file exists', () => {
    const newConfigPath = join(testDir, 'jeeves-runner', 'config.json');
    const result = migrateConfig(newConfigPath);

    expect(result).toBe(false);
    expect(existsSync(newConfigPath)).toBe(false);
  });

  it('resolves base dir from legacy config path', () => {
    const legacyPath = join(testDir, 'jeeves-runner.config.json');
    writeFileSync(legacyPath, JSON.stringify({ port: 9999 }));

    // Pass the legacy path — should still resolve correctly
    const result = migrateConfig(legacyPath);

    expect(result).toBe(true);
    const newConfigPath = join(testDir, 'jeeves-runner', 'config.json');
    expect(existsSync(newConfigPath)).toBe(true);
  });
});
