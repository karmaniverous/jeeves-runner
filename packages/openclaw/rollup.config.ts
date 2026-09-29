/**
 * @module rollup.config
 * Rollup configuration for the OpenClaw plugin package.
 * Single entry point: the plugin (ESM + declarations).
 * Skills are copied from skills/ → dist/skills/ via rollup-plugin-copy.
 */

import { readFileSync } from 'node:fs';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupLog, RollupOptions } from 'rollup';
import copy from 'rollup-plugin-copy';

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageJson;

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

const pluginConfig: RollupOptions = {
  input: 'src/index.ts',
  external: [
    ...dependencyExternals,
    ...dependencyExternals.map((dep) => new RegExp('^' + dep + '/')),
    /^node:/,
  ],
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
      // Type against the built core package, not the source path mapping
      // used by typecheck/tests (see tsconfig.json).
      paths: {},
    }),
    copy({
      targets: [{ src: 'skills/*', dest: 'dist/skills' }],
    }),
  ],
};

export default [pluginConfig];
