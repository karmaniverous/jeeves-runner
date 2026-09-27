/**
 * Narrow arbitrary values to `node:sqlite` bind parameters.
 *
 * @module
 */

import type { SQLInputValue } from 'node:sqlite';

/**
 * Narrow a value to a scalar `node:sqlite` bind parameter.
 *
 * @remarks
 * Accepts `null`, `number`, `bigint` and `string`. The job routes never
 * bind binary blobs, so this helper does not accept them.
 *
 * @param value - Candidate bind value.
 * @returns The value, typed as {@link SQLInputValue}.
 * @throws TypeError for anything else (for example, a boolean or a plain
 *   object). Transform those first.
 */
export function toSqlInput(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'string'
  ) {
    return value;
  }
  throw new TypeError(`Unsupported SQL bind value of type ${typeof value}`);
}
