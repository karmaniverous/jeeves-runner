/**
 * Type definitions for Node.js built-in node:sqlite module (Node 24+).
 * The API is synchronous — all operations return immediately.
 */

declare module 'node:sqlite' {
  /** Statement prepared for parameterized queries. All methods are synchronous. */
  export interface StatementSync {
    run(...params: unknown[]): { lastInsertRowid: number; changes: number };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  /** Synchronous SQLite database connection. */
  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean });
    open(): void;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
