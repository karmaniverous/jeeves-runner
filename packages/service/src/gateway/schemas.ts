/**
 * Zod schemas for OpenClaw Gateway `/tools/invoke` responses (DD#84).
 *
 * Every successful call returns the same envelope,
 * `{ ok: true, result: { content: [...], details } }`, where `details` is the
 * tool's structured result. Shapes were taken from responses captured from a
 * live gateway (OpenClaw 2026.9.6; see `fixtures/README.md`), not from the
 * types this client used to assert. Only the fields the runner reads are
 * required; everything else the gateway sends is ignored.
 *
 * @module
 */

import { z } from 'zod';

/**
 * A tool that ran but reported an error in its details, e.g.
 * `sessions_history` for an unknown key:
 * `{ status: 'error', error: 'No session found: <key>' }`.
 */
export const toolErrorDetailsSchema = z.object({
  status: z.literal('error'),
  error: z.string(),
});

/** `sessions_spawn` details for an accepted spawn. */
export const spawnDetailsSchema = z.object({
  status: z.literal('accepted'),
  childSessionKey: z.string(),
  runId: z.string(),
});

/** One session row in `sessions_list` details. */
export const sessionRowSchema = z.object({
  /** Session key (the gateway calls it `key`, not `sessionKey`). */
  key: z.string(),
  /** Absent on sessions that have not reported usage. */
  totalTokens: z.number().optional(),
  model: z.string().optional(),
  /**
   * Run status. OpenClaw's protocol defines `queued`, `running`, `done`,
   * `failed`, `killed` and `timeout`; kept as a string so a new value does
   * not break parsing.
   */
  status: z.string().optional(),
});

/** `sessions_list` details. */
export const sessionsListDetailsSchema = z.object({
  sessions: z.array(sessionRowSchema),
});

/** One message in `sessions_history` details. */
export const historyMessageSchema = z.object({
  role: z.string(),
  /** `stop`, `toolUse`, `aborted`, ...; absent on non-assistant messages. */
  stopReason: z.string().optional(),
});

/** `sessions_history` details for a known session. */
export const sessionsHistoryDetailsSchema = z.object({
  sessionKey: z.string(),
  messages: z.array(historyMessageSchema),
});

/**
 * The `/tools/invoke` success envelope; `details` is parsed separately
 * with the tool's own schema.
 */
export const toolResponseEnvelopeSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    content: z.array(z.object({ type: z.string() })),
    details: z.unknown(),
  }),
});
