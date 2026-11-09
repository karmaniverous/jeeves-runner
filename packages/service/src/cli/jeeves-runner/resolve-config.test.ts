/**
 * Tests for CLI config resolution (DD#81, #122): root precedence, `-c`,
 * the standard `{configRoot}/jeeves-runner/config.json` location, and the
 * refusal when no config exists.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConfigNotFoundError,
  resolveForCommand,
  resolveRoots,
  resolveRunnerConfig,
} from './resolve-config.js';

describe('resolveRoots', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'roots-ws-'));
    writeFileSync(
      join(workspace, 'jeeves.config.json'),
      JSON.stringify({ core: { configRoot: 'from-file' } }),
    );
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it.each([
    {
      name: 'flag beats env and file',
      opts: { configRoot: 'from-flag' },
      env: { JEEVES_CONFIG_ROOT: 'from-env' },
      expected: { value: 'from-flag', provenance: 'flag' },
    },
    {
      name: 'env beats file',
      opts: {},
      env: { JEEVES_CONFIG_ROOT: 'from-env' },
      expected: { value: 'from-env', provenance: 'env' },
    },
    {
      name: 'file beats default',
      opts: {},
      env: {},
      expected: { value: 'from-file', provenance: 'file' },
    },
  ])('configRoot: $name', ({ opts, env, expected }) => {
    expect(resolveRoots({ workspace, ...opts }, env).configRoot).toEqual(
      expected,
    );
  });

  it('configRoot falls back to ./config without flag, env or file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'roots-empty-'));
    try {
      expect(resolveRoots({ workspace: empty }, {}).configRoot).toEqual({
        value: './config',
        provenance: 'default',
      });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('reads jeeves.config.json from the workspace named by JEEVES_WORKSPACE', () => {
    const roots = resolveRoots({}, { JEEVES_WORKSPACE: workspace });

    expect(roots.workspace).toEqual({ value: workspace, provenance: 'env' });
    expect(roots.configRoot).toEqual({
      value: 'from-file',
      provenance: 'file',
    });
  });

  it('workspace defaults to . without flag or env', () => {
    expect(resolveRoots({}, {}).workspace).toEqual({
      value: '.',
      provenance: 'default',
    });
  });
});

describe('resolveRunnerConfig', () => {
  let root: string;
  let cwd: string;

  /** Write a runner config at `{configRoot}/jeeves-runner/config.json`. */
  function writeStandardConfig(configRoot: string, dbPath: string): string {
    const dir = join(configRoot, 'jeeves-runner');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ dbPath }));
    return path;
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resolve-config-'));
    cwd = process.cwd();
    vi.stubEnv('JEEVES_CONFIG_ROOT', undefined);
    vi.stubEnv('JEEVES_WORKSPACE', undefined);
  });

  afterEach(() => {
    process.chdir(cwd);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('uses {configRoot}/jeeves-runner/config.json when -c is absent', () => {
    const configRoot = join(root, 'cfg');
    const db = join(root, 'db', 'runner.sqlite');
    const path = writeStandardConfig(configRoot, db);

    const resolved = resolveRunnerConfig({ configRoot });

    expect(resolved.configPath).toBe(path);
    expect(resolved.dbPath).toBe(db);
    expect(resolved.config.dbPath).toBe(db);
  });

  it('finds the standard config through JEEVES_CONFIG_ROOT', () => {
    const configRoot = join(root, 'cfg');
    const path = writeStandardConfig(configRoot, join(root, 'r.sqlite'));
    vi.stubEnv('JEEVES_CONFIG_ROOT', configRoot);

    expect(resolveRunnerConfig({}).configPath).toBe(path);
  });

  it('lets -c win over a config at the standard location', () => {
    const configRoot = join(root, 'cfg');
    writeStandardConfig(configRoot, join(root, 'standard.sqlite'));
    const explicit = join(root, 'explicit.json');
    writeFileSync(explicit, JSON.stringify({ dbPath: 'explicit.sqlite' }));

    const resolved = resolveRunnerConfig({ config: explicit, configRoot });

    expect(resolved.configPath).toBe(explicit);
    // A relative dbPath still resolves against the cwd (§5 Backlog).
    expect(resolved.dbPath).toBe(resolve('explicit.sqlite'));
  });

  it('refuses a missing -c file, naming it', () => {
    const missing = join(root, 'nope.json');

    expect(() => resolveRunnerConfig({ config: missing })).toThrow(
      new ConfigNotFoundError(
        `Config file not found: ${missing} (from -c/--config).`,
      ),
    );
  });

  it.each([
    {
      name: 'flag',
      setup: (configRoot: string) => ({ configRoot }),
      origin: 'the --config-root flag',
    },
    {
      name: 'env',
      setup: (configRoot: string) => {
        vi.stubEnv('JEEVES_CONFIG_ROOT', configRoot);
        return {};
      },
      origin: 'JEEVES_CONFIG_ROOT',
    },
  ])(
    'refuses without a config, naming the path and its $name origin',
    ({ setup, origin }) => {
      const configRoot = join(root, 'empty-root');

      const attempt = () => resolveRunnerConfig(setup(configRoot));

      // toThrow(string) matches a substring of the message.
      expect(attempt).toThrow(ConfigNotFoundError);
      expect(attempt).toThrow(
        `No jeeves-runner config found at ${join(resolve(configRoot), 'jeeves-runner', 'config.json')}.`,
      );
      expect(attempt).toThrow(`came from ${origin}.`);
      expect(attempt).toThrow("run 'jeeves-runner init'");
    },
  );

  it('refuses with the default ./config, creating nothing in the cwd', () => {
    process.chdir(root);

    expect(() => resolveRunnerConfig({})).toThrow(
      /No jeeves-runner config found at .*config[\\/]jeeves-runner[\\/]config\.json\.\nconfigRoot "\.\/config" came from the default/,
    );
    expect(readdirSync(root)).toEqual([]);
  });

  it('names jeeves.config.json when configRoot came from it', () => {
    writeFileSync(
      join(root, 'jeeves.config.json'),
      JSON.stringify({ core: { configRoot: './missing-root' } }),
    );

    expect(() => resolveRunnerConfig({ workspace: root })).toThrow(
      `came from core.configRoot in ${join(root, 'jeeves.config.json')}.`,
    );
  });
});

describe('resolveForCommand', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'for-command-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports the absolute config and database paths as info', () => {
    const config = join(root, 'c.json');
    const db = join(root, 'x', 'runner.sqlite');
    writeFileSync(config, JSON.stringify({ dbPath: db }));
    const out = { error: vi.fn(), info: vi.fn() };

    expect(resolveForCommand({ config }, out)?.dbPath).toBe(db);
    expect(out.info.mock.calls).toEqual([
      [`Config: ${config}`],
      [`Database: ${db}`],
    ]);
    expect(out.error).not.toHaveBeenCalled();
    expect(existsSync(join(root, 'x'))).toBe(false);
  });

  it('lets a malformed config fail loudly instead of reporting it missing', () => {
    const config = join(root, 'broken.json');
    writeFileSync(config, '{ not json');
    const out = { error: vi.fn(), info: vi.fn() };

    expect(() => resolveForCommand({ config }, out)).toThrow(SyntaxError);
    expect(out.error).not.toHaveBeenCalled();
  });

  it('writes both diagnostics to stderr by default', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      expect(
        resolveForCommand({ config: join(root, 'missing.json') }),
      ).toBeUndefined();
      const config = join(root, 'c.json');
      writeFileSync(config, JSON.stringify({ dbPath: join(root, 'r.db') }));
      resolveForCommand({ config });

      expect(error.mock.calls.map(([m]) => String(m).split(':')[0])).toEqual([
        'Config file not found',
        'Config',
        'Database',
      ]);
    } finally {
      error.mockRestore();
    }
  });

  it('reports a missing config as an error and returns undefined', () => {
    const out = { error: vi.fn(), info: vi.fn() };

    expect(
      resolveForCommand({ config: join(root, 'missing.json') }, out),
    ).toBeUndefined();
    expect(out.error).toHaveBeenCalledWith(
      expect.stringContaining('Config file not found'),
    );
    expect(out.info).not.toHaveBeenCalled();
  });
});
