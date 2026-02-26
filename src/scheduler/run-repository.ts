/**
 * Run record repository for managing job execution records.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { ExecutionResult } from './executor.js';

/** Run record repository operations. */
export interface RunRepository {
  /** Insert a run record and return its ID. */
  createRun(jobId: string, trigger: string): number;
  /** Update run record with completion data. */
  finishRun(runId: number, execResult: ExecutionResult): void;
}

/** Create a run repository for the given database connection. */
export function createRunRepository(db: DatabaseSync): RunRepository {
  return {
    createRun(jobId: string, trigger: string): number {
      const result = db
        .prepare(
          `INSERT INTO runs (job_id, status, started_at, trigger) 
           VALUES (?, 'running', datetime('now'), ?)`,
        )
        .run(jobId, trigger);
      return Number(result.lastInsertRowid);
    },

    finishRun(runId: number, execResult: ExecutionResult): void {
      db.prepare(
        `UPDATE runs SET status = ?, finished_at = datetime('now'), duration_ms = ?, 
         exit_code = ?, tokens = ?, result_meta = ?, error = ?, stdout_tail = ?, stderr_tail = ?
         WHERE id = ?`,
      ).run(
        execResult.status,
        execResult.durationMs,
        execResult.exitCode,
        execResult.tokens,
        execResult.resultMeta,
        execResult.error,
        execResult.stdoutTail,
        execResult.stderrTail,
        runId,
      );
    },
  };
}
