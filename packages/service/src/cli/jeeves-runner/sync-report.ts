/**
 * Console report for `sync-jobs`.
 *
 * @module
 */

import type { SyncResult } from './sync-types.js';

/** Describe an orphan's state. */
function orphanState(o: { enabled: boolean; disabled: boolean }): string {
  if (o.disabled) return 'disabled';
  if (o.enabled) return 'enabled (use --prune to disable)';
  return 'already disabled';
}

/** Render a sync result as human-readable console text. */
export function formatSyncReport(result: SyncResult): string {
  const { details } = result;
  const lines: string[] = [];
  if (result.dryRun) lines.push('DRY RUN: nothing written.');

  lines.push(`Added (${String(details.added.length)}):`);
  for (const { id, prerequisite } of details.added) {
    lines.push(
      prerequisite ? `  + ${id} (prerequisite: ${prerequisite})` : `  + ${id}`,
    );
  }

  lines.push(`Updated (${String(details.updated.length)}):`);
  for (const { id, diffs } of details.updated) {
    lines.push(`  ~ ${id}`);
    for (const d of diffs) {
      lines.push(
        `      ${d.column}: ${JSON.stringify(d.from)} -> ${JSON.stringify(d.to)}`,
      );
    }
  }

  lines.push(`Unchanged (${String(details.unchanged.length)})`);

  lines.push(`Skipped (${String(result.errors.length)}):`);
  for (const e of result.errors) lines.push(`  ! ${e}`);

  lines.push(`Enabled drift (${String(details.enabledDrift.length)}):`);
  for (const d of details.enabledDrift) {
    const action = d.reset
      ? 'reset to source'
      : 'kept; use --reset-enabled to apply';
    lines.push(
      `  ${d.id}: source ${String(d.source)}, stored ${String(d.stored)} (${action})`,
    );
  }

  lines.push(`Schedule reverts (${String(details.scheduleReverts.length)}):`);
  for (const r of details.scheduleReverts) {
    lines.push(`  ${r.id}: ${r.from} -> ${r.to}`);
  }

  lines.push(`Orphans (${String(details.orphans.length)}):`);
  for (const o of details.orphans) lines.push(`  ${o.id}: ${orphanState(o)}`);

  lines.push(
    `Sync ${result.dryRun ? 'plan' : 'complete'}: ${String(result.added)} added, ${String(result.updated)} updated, ${String(result.unchanged)} unchanged, ${String(result.skipped)} skipped`,
  );
  return lines.join('\n');
}
