/**
 * @module plugin/generateContent.test
 */

import { describe, expect, it, vi } from 'vitest';

import { generateRunnerContent } from './generateContent.js';

describe('generateRunnerContent', () => {
  it('renders stats + jobs', async () => {
    const stats = {
      totalJobs: 2,
      running: 1,
      failedRegistrations: 0,
      okLastHour: 5,
      errorsLastHour: 1,
    };

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

    const md = await generateRunnerContent('http://localhost:1937');

    expect(md).toContain('jeeves-runner connected on http://localhost:1937');
    expect(md).toContain('| Total jobs | 2 |');
    expect(md).toContain('### Jobs');
    expect(md).toContain('| Job A |');
    expect(md).toContain('Job B *(disabled)*');
  });

  it('includes failed registrations row when non-zero', async () => {
    const stats = {
      totalJobs: 3,
      running: 0,
      failedRegistrations: 2,
      okLastHour: 0,
      errorsLastHour: 0,
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.endsWith('/stats')) {
        return Promise.resolve(
          new Response(JSON.stringify(stats), { status: 200 }),
        );
      }
      if (u.endsWith('/jobs')) {
        return Promise.resolve(
          new Response(JSON.stringify({ jobs: [] }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('| Failed registrations | 2 |');
  });

  it('returns action-required block when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('ACTION REQUIRED');
    expect(md).toContain('unreachable');
  });
});
