/**
 * Job seed data loader. Stub for now — jobs will be added via API or migration.
 */

import type { DatabaseSync } from 'node:sqlite';

/**
 * Seed initial jobs into the database (currently a no-op).
 */
export function seedJobs(_db: DatabaseSync): void {
  // No-op for now. Jobs are added via API or during migration.
}
