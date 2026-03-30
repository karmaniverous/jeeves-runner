/**
 * Config path migration utility. Handles migration from legacy flat config
 * file (`\<dir\>/jeeves-runner.config.json`) to new nested config path
 * (`\<dir\>/jeeves-runner/config.json`).
 *
 * @module
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Logger } from 'pino';

/** Legacy config filename. */
const LEGACY_CONFIG_NAME = 'jeeves-runner.config.json';
/** New config directory name. */
const NEW_CONFIG_DIR = 'jeeves-runner';
/** New config filename within the directory. */
const NEW_CONFIG_NAME = 'config.json';

/**
 * Migrate a legacy config file to the new nested path layout.
 *
 * If `\<dir\>/jeeves-runner.config.json` exists and
 * `\<dir\>/jeeves-runner/config.json` does not, creates the directory and
 * moves the file.
 *
 * @param configPath - Path to the new config file or the legacy config file.
 *   The function resolves the base directory from this path.
 * @param logger - Optional logger for migration events.
 * @returns `true` if migration was performed, `false` otherwise.
 */
export function migrateConfig(configPath: string, logger?: Logger): boolean {
  // Resolve the base directory by stripping known suffixes
  const dir = resolveBaseDir(configPath);

  const legacyPath = join(dir, LEGACY_CONFIG_NAME);
  const newDir = join(dir, NEW_CONFIG_DIR);
  const newPath = join(newDir, NEW_CONFIG_NAME);

  // No legacy file → nothing to migrate
  if (!existsSync(legacyPath)) {
    return false;
  }

  // New path already exists → no-op (don't overwrite)
  if (existsSync(newPath)) {
    logger?.info(
      { legacyPath, newPath },
      'Both legacy and new config exist; skipping migration',
    );
    return false;
  }

  // Perform migration
  mkdirSync(newDir, { recursive: true });
  renameSync(legacyPath, newPath);
  logger?.info(
    { from: legacyPath, to: newPath },
    'Migrated config to new path layout',
  );

  return true;
}

/**
 * Resolve the base directory from a config path. Handles both legacy and new
 * path formats.
 */
function resolveBaseDir(configPath: string): string {
  const normalized = configPath.replace(/\\/g, '/');

  // If path ends with new layout: {dir}/jeeves-runner/config.json
  if (
    normalized.endsWith(`${NEW_CONFIG_DIR}/${NEW_CONFIG_NAME}`) ||
    normalized.endsWith(`${NEW_CONFIG_DIR}\\${NEW_CONFIG_NAME}`)
  ) {
    return dirname(dirname(configPath));
  }

  // If path ends with legacy name: {dir}/jeeves-runner.config.json
  if (normalized.endsWith(LEGACY_CONFIG_NAME)) {
    return dirname(configPath);
  }

  // Default: treat as parent directory
  return dirname(configPath);
}
