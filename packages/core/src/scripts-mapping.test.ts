import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAUNCHER_TIMEOUT_MS,
  getLauncherPath,
  isLauncherScript,
  manifestEntryToJob,
  normalizeScriptPath,
  scriptsListSchema,
} from './scripts-mapping.js';

const rrstack = {
  timezone: 'UTC',
  timeUnit: 'ms',
  rules: [{ effect: 'event', options: { freq: 'hourly', interval: 4 } }],
};

describe('manifestEntryToJob', () => {
  it('maps a full manifest to a launcher job (posix)', () => {
    const job = manifestEntryToJob(
      {
        id: 'admin-check',
        manifest: {
          id: 'admin-check',
          domain: 'admin',
          name: 'Check',
          description: 'Checks things',
          schedule: rrstack,
          type: 'script',
          overlap_policy: 'allow',
          timeout_seconds: 60,
          enabled: false,
          prerequisite: 'GitHub CLI auth',
          args: ['--verbose'],
          env: { FOO: 'bar' },
          on_failure: 'C1',
          on_success: null,
        },
      },
      '/srv/jeeves-scripts',
      'posix',
    );

    expect(job).toEqual({
      id: 'admin-check',
      name: 'Check',
      schedule: JSON.stringify(rrstack),
      script: '/srv/jeeves-scripts/bin/jeeves-scripts.js',
      args: ['run', 'admin-check', '--verbose'],
      type: 'script',
      description: 'Checks things',
      timeout_ms: 60000,
      overlap_policy: 'allow',
      enabled: false,
      env: { FOO: 'bar' },
      on_failure: 'C1',
      on_success: null,
      prerequisite: 'GitHub CLI auth',
      specified: [
        'name',
        'schedule',
        'script',
        'args',
        'type',
        'description',
        'timeout_ms',
        'overlap_policy',
        'env',
        'on_failure',
        'on_success',
      ],
    });
  });

  it('applies defaults for a minimal manifest', () => {
    const job = manifestEntryToJob(
      { id: 'min', manifest: { name: 'Min', schedule: '0 * * * *' } },
      '/srv/s',
      'posix',
    );

    expect(job).toMatchObject({
      schedule: '0 * * * *',
      args: ['run', 'min'],
      type: 'script',
      description: null,
      timeout_ms: DEFAULT_LAUNCHER_TIMEOUT_MS,
      overlap_policy: 'skip',
      enabled: true,
      env: null,
      on_failure: null,
      on_success: null,
      prerequisite: null,
      // Only the always-set fields: defaults above apply to new jobs only.
      specified: ['name', 'schedule', 'script', 'args'],
    });
  });

  it('marks an explicit null as specified (it clears the field)', () => {
    const job = manifestEntryToJob(
      {
        id: 'n',
        manifest: { name: 'N', schedule: '0 * * * *', on_failure: null },
      },
      '/srv/s',
      'posix',
    );

    expect(job?.specified).toContain('on_failure');
    expect(job?.on_failure).toBeNull();
  });

  it('returns null for an entry without a manifest', () => {
    expect(manifestEntryToJob({ id: 'x', manifest: null }, '/s')).toBeNull();
  });

  it('builds a native Windows launcher path', () => {
    expect(getLauncherPath('J:/jeeves-scripts', 'win32')).toBe(
      'J:\\jeeves-scripts\\bin\\jeeves-scripts.js',
    );
  });
});

describe('path normalisation (DD#70)', () => {
  it('matches the same Windows dir written with different case and separators', () => {
    expect(
      isLauncherScript(
        'j:\\JEEVES-SCRIPTS\\bin\\jeeves-scripts.js',
        'J:/jeeves-scripts',
        'win32',
      ),
    ).toBe(true);
  });

  it('is case-sensitive on posix', () => {
    expect(
      isLauncherScript(
        '/srv/Jeeves-Scripts/bin/jeeves-scripts.js',
        '/srv/jeeves-scripts',
        'posix',
      ),
    ).toBe(false);
    expect(
      isLauncherScript(
        '/srv/jeeves-scripts/bin/../bin/jeeves-scripts.js',
        '/srv/jeeves-scripts/',
        'posix',
      ),
    ).toBe(true);
  });

  it('does not match a different script', () => {
    expect(
      isLauncherScript(
        'J:/other/bin/jeeves-scripts.js',
        'J:/jeeves-scripts',
        'win32',
      ),
    ).toBe(false);
  });

  it('normalises Windows paths to lowercase forward slashes', () => {
    expect(normalizeScriptPath('J:\\A\\b.js', 'win32')).toBe('j:/a/b.js');
  });
});

describe('scriptsListSchema', () => {
  it('accepts real list --json entries, including null manifests', () => {
    const parsed = scriptsListSchema.safeParse([
      {
        id: 'a',
        source: 'core',
        domain: 'admin',
        schedule: rrstack,
        enabled: true,
        description: 'd',
        manifest: {
          id: 'a',
          domain: 'admin',
          name: 'A',
          schedule: rrstack,
          overlap_policy: 'skip',
          timeout_seconds: 60,
          enabled: true,
          prerequisite: null,
        },
      },
      { id: 'b', source: 'core', domain: 'x', manifest: null },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects an entry without an id', () => {
    expect(scriptsListSchema.safeParse([{ manifest: null }]).success).toBe(
      false,
    );
  });

  it('rejects a manifest with an invalid overlap policy', () => {
    expect(
      scriptsListSchema.safeParse([
        {
          id: 'a',
          manifest: {
            name: 'A',
            schedule: '* * * * *',
            overlap_policy: 'queue',
          },
        },
      ]).success,
    ).toBe(false);
  });
});
