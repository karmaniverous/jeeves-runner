/**
 * @module rollup.config
 * Rollup configuration for the OpenClaw plugin package.
 * Two entry points: plugin (ESM + declarations) and CLI (ESM executable).
 * Skills are copied from skills/ → dist/skills/ via rollup-plugin-copy.
 */

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupLog, RollupOptions } from 'rollup';
import copy from 'rollup-plugin-copy';

/** Suppress circular-dependency warnings from node_modules (third-party). */
function onwarn(warning: RollupLog, defaultHandler: (w: RollupLog) => void) {
  if (
    warning.code === 'CIRCULAR_DEPENDENCY' &&
    warning.ids?.every((id) => id.includes('node_modules'))
  )
    return;
  defaultHandler(warning);
}

const pluginConfig: RollupOptions = {
  input: 'src/index.ts',
  external: [/^node:/],
  onwarn,
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    json(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      noEmit: false,
      declaration: true,
      declarationDir: 'dist',
      declarationMap: false,
      incremental: false,
    }),
    copy({
      targets: [{ src: 'skills/*', dest: 'dist/skills' }],
    }),
  ],
};

const cliConfig: RollupOptions = {
  input: 'src/cli.ts',
  external: [/^node:/],
  onwarn,
  output: {
    file: 'dist/cli.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      outDir: 'dist',
      noEmit: false,
      declaration: false,
      incremental: false,
    }),
  ],
};

export default [pluginConfig, cliConfig];
