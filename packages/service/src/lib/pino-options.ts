/**
 * Shared pino logger options builder.
 *
 * @module
 */

import type { LoggerOptions } from 'pino';

/** Log configuration accepted by the runner. */
export interface LogConfig {
  level: string;
  file?: string;
}

/** Build pino options from the runner's log config. */
export function buildPinoOptions(config: LogConfig): LoggerOptions {
  return {
    level: config.level,
    ...(config.file
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: config.file },
          },
        }
      : {}),
  };
}
