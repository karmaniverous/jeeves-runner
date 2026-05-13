/**
 * Rollup configuration for the jeeves-runner service package.
 * Builds:
 * - ESM library output (dist/mjs)
 * - bundled type definitions (dist/index.d.ts)
 * - CLI commands (dist/cli/*)
 *
 * @module rollup.config
 */

import type { Alias } from '@rollup/plugin-alias';
import aliasPlugin from '@rollup/plugin-alias';
import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import fs from 'fs-extra';
import type { RollupOptions } from 'rollup';
import copyPlugin from 'rollup-plugin-copy';
import dtsPlugin from 'rollup-plugin-dts';

interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg: PackageJson = JSON.parse(
  await fs.readFile('./package.json', 'utf-8'),
) as PackageJson;

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

const commonAliases: Alias[] = [];

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
const cliCommands: string[] = await fs.readdir('src/cli').catch(() => []);

/** Build the library (ESM only). */
const buildLibrary = (dest: string): RollupOptions => ({
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
const buildTypes = (dest: string): RollupOptions => ({
  input: 'src/index.ts',
  external: [...dependencyExternals, /^node:/],
  output: [{ file: `${dest}/index.d.ts`, format: 'esm' }],
  plugins: [dtsPlugin()],
});

/** Assemble complete config (ESM library, types, and CLI outputs). */
const config: RollupOptions[] = [
  buildLibrary(outputPath),
  buildTypes(outputPath),
  ...cliCommands.map(
    (c): RollupOptions => ({
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
    }),
  ),
];

export default config;
