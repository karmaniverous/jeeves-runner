/**
 * Schedule parsing, validation, and next-fire-time computation for cron and RRStack formats.
 *
 * @module
 */

import { RRStack, type RRStackOptions } from '@karmaniverous/rrstack';
import { Cron } from 'croner';

/** Validation result for a schedule string. */
export type ScheduleValidation =
  | { valid: true; format: 'cron' | 'rrstack' }
  | { valid: false; error: string };

/**
 * Attempt to parse a schedule string as RRStack JSON (non-null, non-array
 * object). Returns the parsed options on success, or null if the string
 * is not a JSON object.
 */
function tryParseRRStack(schedule: string): RRStackOptions | null {
  try {
    const parsed: unknown = JSON.parse(schedule);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as RRStackOptions;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the next fire time for a schedule string.
 * Supports cron expressions (via croner) and RRStack JSON (via nextEvent).
 *
 * @param schedule - Cron expression or RRStack JSON string.
 * @returns Next fire time as a Date, or null if none can be determined.
 */
export function getNextFireTime(schedule: string): Date | null {
  const rrOpts = tryParseRRStack(schedule);
  if (rrOpts) {
    const stack = new RRStack(rrOpts);
    const next = stack.nextEvent();
    if (!next) return null;
    const unit = stack.timeUnit;
    return new Date(unit === 's' ? next.at * 1000 : next.at);
  }

  const cron = new Cron(schedule);
  return cron.nextRun() ?? null;
}

/**
 * Validate a schedule string as either a cron expression or RRStack JSON.
 *
 * @param schedule - Cron expression or RRStack JSON string.
 * @returns Validation result with format on success, or error message on failure.
 */
export function validateSchedule(schedule: string): ScheduleValidation {
  const rrOpts = tryParseRRStack(schedule);
  if (rrOpts) {
    try {
      new RRStack(rrOpts);
      return { valid: true, format: 'rrstack' };
    } catch (err) {
      return {
        valid: false,
        error: `Invalid RRStack schedule: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    new Cron(schedule);
    return { valid: true, format: 'cron' };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid cron expression: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
