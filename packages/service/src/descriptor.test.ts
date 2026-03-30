/**
 * Tests for the runner component descriptor factory.
 */

import { describe, expect, it } from 'vitest';

import { createRunnerDescriptor } from './descriptor.js';

describe('createRunnerDescriptor', () => {
  it('returns a descriptor with correct static properties', () => {
    const descriptor = createRunnerDescriptor();

    expect(descriptor.name).toBe('runner');
    expect(descriptor.servicePackage).toBe('@karmaniverous/jeeves-runner');
    expect(descriptor.pluginPackage).toBe(
      '@karmaniverous/jeeves-runner-openclaw',
    );
    expect(descriptor.defaultPort).toBe(1937);
    expect(descriptor.configFileName).toBe('config.json');
    expect(descriptor.refreshIntervalSeconds).toBe(67);
  });

  it('initTemplate returns a valid default config object', () => {
    const descriptor = createRunnerDescriptor();
    const config = descriptor.initTemplate();

    expect(config).toHaveProperty('port', 1937);
    expect(config).toHaveProperty('maxConcurrency');
    expect(config).toHaveProperty('notifications');
    expect(config).toHaveProperty('log');
  });

  it('startCommand produces a node CLI invocation', () => {
    const descriptor = createRunnerDescriptor();
    const cmd = descriptor.startCommand('/etc/runner/config.json');

    expect(cmd[0]).toBe('node');
    expect(cmd).toContain('--config');
    expect(cmd).toContain('/etc/runner/config.json');
    expect(cmd.some((arg: string) => arg.includes('index.js'))).toBe(true);
  });

  it('uses default generateToolsContent when none provided', () => {
    const descriptor = createRunnerDescriptor();
    const content = descriptor.generateToolsContent();

    expect(content).toContain('pending');
  });

  it('forwards custom onConfigApply callback', async () => {
    let called = false;
    const descriptor = createRunnerDescriptor({
      onConfigApply: () => {
        called = true;
        return Promise.resolve();
      },
    });

    await descriptor.onConfigApply!({});
    expect(called).toBe(true);
  });

  it('forwards custom generateToolsContent', () => {
    const descriptor = createRunnerDescriptor({
      generateToolsContent: () => '# Custom tools',
    });

    expect(descriptor.generateToolsContent()).toBe('# Custom tools');
  });

  it('onConfigApply is undefined when not provided', () => {
    const descriptor = createRunnerDescriptor();
    expect(descriptor.onConfigApply).toBeUndefined();
  });
});
