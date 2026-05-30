/**
 * @module rollup.config
 * Rollup configuration for the jeeves-runner-core package.
 * Single entry point: src/index.ts → ESM output with declarations.
 */

import { readFileSync } from 'node:fs';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupLog, RollupOptions } from 'rollup';

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as PackageJson;

const dependencyExternals = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

/** Suppress circular-dependency warnings from node_modules (third-party). */
function onwarn(warning: RollupLog, defaultHandler: (w: RollupLog) => void) {
  if (
    warning.code === 'CIRCULAR_DEPENDENCY' &&
    warning.ids?.every((id) => id.includes('node_modules'))
  )
    return;
  defaultHandler(warning);
}

const config: RollupOptions = {
  input: 'src/index.ts',
  external: [...dependencyExternals, /^node:/],
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
      rootDir: 'src',
      exclude: ['rollup.config.ts'],
    }),
  ],
};

export default config;
