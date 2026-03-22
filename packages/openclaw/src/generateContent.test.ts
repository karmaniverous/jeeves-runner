/**
 * @module plugin/generateContent.test
 */

import { describe, expect, it, vi } from 'vitest';

import { generateRunnerContent } from './generateContent.js';

/** Default stats fixture. */
const defaultStats = {
  totalJobs: 2,
  running: 1,
  failedRegistrations: 0,
  okLastHour: 5,
  errorsLastHour: 1,
};

/** Mock fetch to return stats and jobs payloads. */
function mockApi(
  stats: Record<string, unknown>,
  jobs: Record<string, unknown>[],
): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.endsWith('/stats')) {
      return Promise.resolve(
        new Response(JSON.stringify(stats), { status: 200 }),
      );
    }
    if (u.endsWith('/jobs')) {
      return Promise.resolve(
        new Response(JSON.stringify({ jobs }), { status: 200 }),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
}

describe('generateRunnerContent', () => {
  it('renders stats + jobs', async () => {
    const jobs = [
      {
        id: 'a',
        name: 'Job A',
        enabled: true,
        schedule: '* * * * *',
        lastRun: { status: 'ok', finished_at: '2026-01-01T00:00:00.000Z' },
      },
      {
        id: 'b',
        name: 'Job B',
        enabled: false,
        schedule: '0 * * * *',
      },
    ];

    mockApi(defaultStats, jobs);

    const md = await generateRunnerContent('http://localhost:1937');

    expect(md).toContain('jeeves-runner connected on http://localhost:1937');
    expect(md).toContain('| Total jobs | 2 |');
    expect(md).toContain('### Jobs');
    expect(md).toContain('| Job A |');
    expect(md).toContain('Job B *(disabled)*');
  });

  it('includes failed registrations row when non-zero', async () => {
    const stats = { ...defaultStats, failedRegistrations: 2 };
    mockApi(stats, []);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('| Failed registrations | 2 |');
  });

  it('returns action-required block when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('ACTION REQUIRED');
    expect(md).toContain('unreachable');
  });

  it('shows rrstack label for JSON schedule', async () => {
    const jobs = [
      {
        id: 'rr',
        name: 'RRStack Job',
        enabled: true,
        schedule: '{"freq":"daily","interval":1}',
      },
    ];

    mockApi(defaultStats, jobs);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('*(rrstack)*');
    expect(md).not.toContain('`{"freq"');
  });

  it('shows cron schedule in backticks', async () => {
    const jobs = [
      {
        id: 'c',
        name: 'Cron Job',
        enabled: true,
        schedule: '*/5 * * * *',
      },
    ];

    mockApi(defaultStats, jobs);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('`*/5 * * * *`');
  });

  it('tags inline source_type jobs', async () => {
    const jobs = [
      {
        id: 'inl',
        name: 'Inline Job',
        enabled: true,
        schedule: '* * * * *',
        source_type: 'inline',
      },
    ];

    mockApi(defaultStats, jobs);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('*(inline)*');
  });

  it('does not tag path source_type jobs', async () => {
    const jobs = [
      {
        id: 'p',
        name: 'Path Job',
        enabled: true,
        schedule: '* * * * *',
        source_type: 'path',
      },
    ];

    mockApi(defaultStats, jobs);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).not.toContain('*(inline)*');
    expect(md).toContain('| Path Job |');
  });
});
