import { describe, expect, it } from 'vitest';

import { toSqlInput } from './sql-input.js';

describe('toSqlInput', () => {
  it.each([null, 0, 1.5, 10n, '', 'text'])(
    'passes through bindable value %s',
    (value) => {
      expect(toSqlInput(value)).toBe(value);
    },
  );

  it.each([undefined, true, {}, [], () => 0, new Uint8Array([1])])(
    'rejects unbindable value %s',
    (value) => {
      expect(() => toSqlInput(value)).toThrow(TypeError);
    },
  );
});
