/**
 * @module contracts.test
 * The deprecated response contracts (DD#86, DD#88): every 0.6.0-0 type is still declared, exported only as a `@deprecated` alias naming its catalog replacement, and re-exported from the package entry. Source-level checks: the types have no runtime presence, and referencing them fails `no-deprecated`.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  readFileSync(new URL(file, import.meta.url), 'utf8');
const source = read('./contracts.ts');

const CONTRACTS = [
  ['JobListItem', 'JobListRow'],
  ['JobsResponse', "RunnerResponse<'listJobs'>"],
  ['JobDetailResponse', "RunnerResponse<'jobDetail'>"],
  ['RunRecord', 'RunRow'],
  ['RunsResponse', "RunnerResponse<'jobRuns'>"],
  ['QueuesResponse', "RunnerResponse<'listQueues'>"],
  ['QueueStatusResponse', "RunnerResponse<'queueStatus'>"],
  ['QueuePeekItem', "RunnerResponse<'queuePeek'>"],
  ['QueuePeekResponse', "RunnerResponse<'queuePeek'>"],
  ['NamespacesResponse', "RunnerResponse<'listNamespaces'>"],
  ['StateResponse', "RunnerResponse<'queryState'>"],
  ['StateCollectionItem', "RunnerResponse<'queryCollection'>"],
  ['CollectionResponse', "RunnerResponse<'queryCollection'>"],
] as const;

describe('contracts (deprecated)', () => {
  it.each(CONTRACTS)(
    '%s is an exported @deprecated alias pointing to %s',
    (name, replacement) => {
      const declaration = `export type ${name} = ${name}Shape;`;
      const at = source.indexOf(declaration);
      expect(at).toBeGreaterThan(0);
      const doc = source.slice(source.lastIndexOf('/**', at), at);
      expect(doc).toContain(`@deprecated Use \`${replacement}`);
      expect(source).toContain(`interface ${name}Shape`);
    },
  );

  it('exports only the deprecated aliases', () => {
    const exported = [...source.matchAll(/^export (\w+) (\w+)/gm)].map(
      (match) => `${match[1]} ${match[2]}`,
    );
    expect(exported.sort()).toEqual(
      CONTRACTS.map(([name]) => `type ${name}`).sort(),
    );
  });

  it('is re-exported from the package entry', () => {
    expect(read('./index.ts')).toContain(
      "export type * from './contracts.js';",
    );
  });
});
