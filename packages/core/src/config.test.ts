import { describe, expect, it, vi } from 'vitest';

import { runnerConfigSchema } from './config.js';

describe('runnerConfigSchema', () => {
  it('parses new config shape', () => {
    const config = runnerConfigSchema.parse({
      gatewayUrl: 'http://example.com:9999',
      gatewayApiKey: 'my-secret',
      logging: { level: 'debug', file: '/tmp/runner.log' },
    });

    expect(config.gatewayUrl).toBe('http://example.com:9999');
    expect(config.gatewayApiKey).toBe('my-secret');
    expect(config.logging.level).toBe('debug');
    expect(config.logging.file).toBe('/tmp/runner.log');
  });

  it('applies defaults for empty input', () => {
    const config = runnerConfigSchema.parse({});

    expect(config.gatewayUrl).toBe('http://127.0.0.1:18789');
    expect(config.gatewayApiKey).toBeUndefined();
    expect(config.logging.level).toBe('info');
    expect(config.logging.file).toBeUndefined();
  });

  it('migrates deprecated gateway object to flat keys', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = runnerConfigSchema.parse({
      gateway: { url: 'http://old-gateway:8080' },
    });

    expect(config.gatewayUrl).toBe('http://old-gateway:8080');
    expect(config.gatewayApiKey).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"gateway" is deprecated'),
    );

    warnSpy.mockRestore();
  });

  it('migrates deprecated log key to logging', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = runnerConfigSchema.parse({
      log: { level: 'debug', file: '/tmp/old.log' },
    });

    expect(config.logging.level).toBe('debug');
    expect(config.logging.file).toBe('/tmp/old.log');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('"log" is deprecated'),
    );

    warnSpy.mockRestore();
  });

  it('prefers new keys when both old and new are present', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const config = runnerConfigSchema.parse({
      logging: { level: 'error' },
      log: { level: 'debug' },
    });

    expect(config.logging.level).toBe('error');

    warnSpy.mockRestore();
  });
});
