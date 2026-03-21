/**
 * Rollup configuration for the jeeves-runner service package.
 * Builds:
 * - ESM library output (dist/mjs)
 * - bundled type definitions (dist/index.d.ts)
 * - CLI commands (dist/cli/*)
 *
 * Authored as ESM JavaScript to avoid Rollup config-plugin TypeScript warnings.
 *
 * @module rollup.config
 */

import { createRequire } from 'node:module';

/**
 * Minimal package.json shape used by this config.
 *
 * @typedef {{
 *   dependencies?: Record<string, string>,
 *   peerDependencies?: Record<string, string>
 * }} PackageJson
 */

import aliasPlugin from '@rollup/plugin-alias';
import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import fs from 'fs-extra';
import copyPlugin from 'rollup-plugin-copy';
import dtsPlugin from 'rollup-plugin-dts';

const require = createRequire(import.meta.url);
/** @type {PackageJson} */
const pkg = require('./package.json');

const outputPath = 'dist';

// Rollup writes bundle outputs; the TS plugin should only transpile.
// - outputToFilesystem=false avoids outDir/dir validation errors for multi-output builds.
// - incremental=false avoids TS build-info state referencing transient Rollup artifacts.
const typescript = typescriptPlugin({
  tsconfig: './tsconfig.json',
  outputToFilesystem: false,
  include: ['src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
  noEmit: false,
  declaration: false,
  declarationMap: false,
  incremental: false,
  allowJs: false,
  checkJs: false,
});

const commonPlugins = [
  commonjsPlugin(),
  jsonPlugin(),
  nodeResolve(),
  typescript,
  copyPlugin({
    targets: [{ src: 'src/db/migrations/*.sql', dest: 'dist/db/migrations' }],
  }),
];

/** @type {import('@rollup/plugin-alias').Alias[]} */
const commonAliases = [];

const dependencyExternals = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

/**
 * Common input options for library builds (ESM only).
 * Externalize runtime dependencies and node builtins.
 */
const commonInputOptions = {
  input: 'src/index.ts',
  external: [...dependencyExternals, 'tslib', /^node:/],
  plugins: [aliasPlugin({ entries: commonAliases }), ...commonPlugins],
};

/** Discover CLI commands under src/cli. */
const cliCommands = await fs.readdir('src/cli').catch(() => []);

/** Build the library (ESM only). */
/** @param {string} dest */
export const buildLibrary = (dest) => ({
  ...commonInputOptions,
  output: [
    {
      dir: `${dest}/mjs`,
      extend: true,
      format: 'esm',
    },
  ],
});

/** Build bundled .d.ts at dest/index.d.ts. */
/** @param {string} dest */
export const buildTypes = (dest) => ({
  input: 'src/index.ts',
  external: [...dependencyExternals, /^node:/],
  output: [{ file: `${dest}/index.d.ts`, format: 'esm' }],
  plugins: [dtsPlugin()],
});

/** Assemble complete config (ESM library, types, and CLI outputs). */
const config = [
  buildLibrary(outputPath),
  buildTypes(outputPath),
  ...cliCommands.map((c) => ({
    ...commonInputOptions,
    input: `src/cli/${c}/index.ts`,
    output: [
      {
        dir: `${outputPath}/cli/${c}`,
        extend: true,
        format: 'esm',
        banner: '#!/usr/bin/env node',
      },
    ],
  })),
];

export default config;
