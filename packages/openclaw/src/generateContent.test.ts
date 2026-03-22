/**
 * @module plugin/generateContent.test
 */

import { describe, expect, it, vi } from 'vitest';

import { generateRunnerContent } from './generateContent.js';

/** Default status fixture. */
const defaultStatus = {
  status: 'ok',
  version: '0.6.0',
  uptime: 3600,
  totalJobs: 2,
  running: 1,
  failedRegistrations: 0,
  okLastHour: 5,
  errorsLastHour: 1,
};

/** Mock fetch to return a status payload. */
function mockStatus(status: Record<string, unknown>): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(status), { status: 200 }),
  );
}

describe('generateRunnerContent', () => {
  it('renders stats summary from /status', async () => {
    mockStatus(defaultStatus);

    const md = await generateRunnerContent('http://localhost:1937');

    expect(md).toContain(
      'jeeves-runner v0.6.0 connected on http://localhost:1937',
    );
    expect(md).toContain('| Total jobs | 2 |');
    expect(md).toContain('| Running | 1 |');
    expect(md).toContain('| OK last hour | 5 |');
    expect(md).toContain('| Errors last hour | 1 |');
  });

  it('does not include a job listing table', async () => {
    mockStatus(defaultStatus);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).not.toContain('### Jobs');
  });

  it('includes failed registrations row when non-zero', async () => {
    mockStatus({ ...defaultStatus, failedRegistrations: 2 });

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('| Failed registrations | 2 |');
  });

  it('excludes failed registrations row when zero', async () => {
    mockStatus(defaultStatus);

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).not.toContain('Failed registrations');
  });

  it('returns action-required block when unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));

    const md = await generateRunnerContent('http://localhost:1937');
    expect(md).toContain('ACTION REQUIRED');
    expect(md).toContain('unreachable');
  });
});
