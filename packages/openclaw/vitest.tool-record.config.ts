/**
 * Vitest config for recording the plugin tool baseline: runs only `src/test/toolRecord.record.ts`, which writes the tool definitions and scenario results to the file named by `TOOL_RECORD`. Not part of `npm test`.
 *
 * @module vitest.tool-record.config
 */
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config.js';

export default mergeConfig(
  base,
  defineConfig({
    test: { include: ['src/test/toolRecord.record.ts'] },
  }),
);
