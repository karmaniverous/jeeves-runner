/**
 * Job CRUD routes: create, update, delete, enable/disable, and script update endpoints.
 *
 * @module
 */

import type { DatabaseSync } from 'node:sqlite';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { validateSchedule } from '../scheduler/schedule-utils.js';
import type { Scheduler } from '../scheduler/scheduler.js';

/** Dependencies for job management routes. */
export interface JobRouteDeps {
  db: DatabaseSync;
  scheduler: Scheduler;
}

/** Zod schema for job creation/update request body. */
const createJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  schedule: z.string().min(1),
  script: z.string().min(1),
  source_type: z.enum(['path', 'inline']).default('path'),
  type: z.enum(['script', 'session']).default('script'),
  timeout_seconds: z.number().positive().optional(),
  overlap_policy: z.enum(['skip', 'allow']).default('skip'),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  on_failure: z.string().nullable().optional(),
  on_success: z.string().nullable().optional(),
});

/** Zod schema for job update (all fields optional except what's set). */
const updateJobSchema = createJobSchema.omit({ id: true }).partial();

/** Zod schema for script update request body. */
const updateScriptSchema = z.object({
  script: z.string().min(1),
  source_type: z.enum(['path', 'inline']).optional(),
});

/** Standard error message for missing job resources. */
const JOB_NOT_FOUND = 'Job not found';

/**
 * Register job CRUD routes on the Fastify instance.
 */
export function registerJobRoutes(
  app: FastifyInstance,
  deps: JobRouteDeps,
): void {
  const { db, scheduler } = deps;

  /** POST /jobs — Create a new job. */
  app.post('/jobs', (request, reply) => {
    const parsed = createJobSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.message };
    }

    const data = parsed.data;
    const validation = validateSchedule(data.schedule);
    if (!validation.valid) {
      reply.code(400);
      return { error: validation.error };
    }

    const timeoutMs = data.timeout_seconds ? data.timeout_seconds * 1000 : null;

    db.prepare(
      `INSERT INTO jobs (id, name, schedule, script, source_type, type, timeout_ms,
       overlap_policy, enabled, description, on_failure, on_success)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      data.id,
      data.name,
      data.schedule,
      data.script,
      data.source_type,
      data.type,
      timeoutMs,
      data.overlap_policy,
      data.enabled ? 1 : 0,
      data.description ?? null,
      data.on_failure ?? null,
      data.on_success ?? null,
    );

    scheduler.reconcileNow();
    reply.code(201);
    return { ok: true, id: data.id };
  });

  /** PATCH /jobs/:id — Partial update of an existing job. */
  app.patch<{ Params: { id: string } }>('/jobs/:id', (request, reply) => {
    const parsed = updateJobSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.message };
    }

    const existing = db
      .prepare('SELECT id FROM jobs WHERE id = ?')
      .get(request.params.id);
    if (!existing) {
      reply.code(404);
      return { error: JOB_NOT_FOUND };
    }

    const data = parsed.data;

    if (data.schedule) {
      const validation = validateSchedule(data.schedule);
      if (!validation.valid) {
        reply.code(400);
        return { error: validation.error };
      }
    }

    /** Map input field → DB column + value transform. */
    const fieldMap: Array<{
      input: keyof typeof data;
      column: string;
      transform?: (v: unknown) => unknown;
    }> = [
      { input: 'name', column: 'name' },
      { input: 'schedule', column: 'schedule' },
      { input: 'script', column: 'script' },
      { input: 'source_type', column: 'source_type' },
      { input: 'type', column: 'type' },
      {
        input: 'timeout_seconds',
        column: 'timeout_ms',
        transform: (v) => (v as number) * 1000,
      },
      { input: 'overlap_policy', column: 'overlap_policy' },
      {
        input: 'enabled',
        column: 'enabled',
        transform: (v) => (v ? 1 : 0),
      },
      { input: 'description', column: 'description' },
      { input: 'on_failure', column: 'on_failure' },
      { input: 'on_success', column: 'on_success' },
    ];

    const sets: string[] = [];
    const values: unknown[] = [];

    for (const { input, column, transform } of fieldMap) {
      if (data[input] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(transform ? transform(data[input]) : data[input]);
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      values.push(request.params.id);
      db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(
        ...values,
      );
    }

    scheduler.reconcileNow();
    return { ok: true };
  });

  /** DELETE /jobs/:id — Delete a job and its runs. */
  app.delete<{ Params: { id: string } }>('/jobs/:id', (request, reply) => {
    db.prepare('DELETE FROM runs WHERE job_id = ?').run(request.params.id);
    const result = db
      .prepare('DELETE FROM jobs WHERE id = ?')
      .run(request.params.id);

    if (result.changes === 0) {
      reply.code(404);
      return { error: JOB_NOT_FOUND };
    }

    scheduler.reconcileNow();
    return { ok: true };
  });

  /** Register a PATCH toggle endpoint (enable or disable). */
  function registerToggle(path: string, enabledValue: number): void {
    app.patch<{ Params: { id: string } }>(path, (request, reply) => {
      const result = db
        .prepare('UPDATE jobs SET enabled = ? WHERE id = ?')
        .run(enabledValue, request.params.id);
      if (result.changes === 0) {
        reply.code(404);
        return { error: JOB_NOT_FOUND };
      }
      scheduler.reconcileNow();
      return { ok: true };
    });
  }

  registerToggle('/jobs/:id/enable', 1);
  registerToggle('/jobs/:id/disable', 0);

  /** PUT /jobs/:id/script — Update job script and source_type. */
  app.put<{ Params: { id: string } }>('/jobs/:id/script', (request, reply) => {
    const parsed = updateScriptSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.message };
    }

    const data = parsed.data;
    const result = data.source_type
      ? db
          .prepare('UPDATE jobs SET script = ?, source_type = ? WHERE id = ?')
          .run(data.script, data.source_type, request.params.id)
      : db
          .prepare('UPDATE jobs SET script = ? WHERE id = ?')
          .run(data.script, request.params.id);

    if (result.changes === 0) {
      reply.code(404);
      return { error: JOB_NOT_FOUND };
    }

    scheduler.reconcileNow();
    return { ok: true };
  });
}
