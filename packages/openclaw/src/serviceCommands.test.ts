/**
 * @module plugin/serviceCommands.test
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createRunnerPluginCommands,
  createRunnerServiceCommands,
} from './serviceCommands.js';

describe('createRunnerServiceCommands', () => {
  it('status returns running state from /status', async () => {
    const statusResp = {
      status: 'ok',
      uptime: 3600,
      version: '0.6.0',
      totalJobs: 40,
      running: 0,
      failedRegistrations: 0,
      okLastHour: 10,
      errorsLastHour: 0,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(statusResp), { status: 200 }),
    );

    const cmds = createRunnerServiceCommands('http://localhost:1937');
    const status = await cmds.status();

    expect(status).toEqual({
      running: true,
      version: '0.6.0',
      uptimeSeconds: 3600,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:1937/status',
      undefined,
    );
  });

  it('status returns running=false when service reports non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ status: 'degraded', version: '0.8.0', uptime: 100 }),
        { status: 200 },
      ),
    );

    const cmds = createRunnerServiceCommands('http://localhost:1937');
    const status = await cmds.status();

    expect(status.running).toBe(false);
    expect(status.version).toBe('0.8.0');
    expect(status.uptimeSeconds).toBe(100);
  });

  it('status returns running=false when service unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new Error('ECONNREFUSED'),
    );

    const cmds = createRunnerServiceCommands('http://localhost:1937');
    const status = await cmds.status();

    expect(status).toEqual({ running: false });
  });

  it('stop resolves without throwing', async () => {
    const cmds = createRunnerServiceCommands('http://localhost:1937');
    await expect(cmds.stop()).resolves.toBeUndefined();
  });

  it('uninstall resolves without throwing', async () => {
    const cmds = createRunnerServiceCommands('http://localhost:1937');
    await expect(cmds.uninstall()).resolves.toBeUndefined();
  });
});

describe('createRunnerPluginCommands', () => {
  it('uninstall resolves without throwing', async () => {
    const cmds = createRunnerPluginCommands();
    await expect(cmds.uninstall()).resolves.toBeUndefined();
  });
});
