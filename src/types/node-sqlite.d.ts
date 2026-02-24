/**
 * Type definitions for Node.js built-in node:sqlite module (Node 24+).
 * Minimal interface for our usage.
 */

declare module 'node:sqlite' {
  export interface Database {
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }

  export interface Statement {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    finalize(): void;
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean });
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
  }
}
