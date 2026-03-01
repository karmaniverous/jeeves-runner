/**
 * Job executor. Spawns job scripts as child processes, captures output, parses result metadata, enforces timeouts.
 */

import { spawn } from 'node:child_process';
import { extname } from 'node:path';

/** Result of a job execution. */
export interface ExecutionResult {
  /** Execution outcome: 'ok', 'error', or 'timeout'. */
  status: 'ok' | 'error' | 'timeout';
  /** Process exit code (null if timeout or spawn error). */
  exitCode: number | null;
  /** Total execution duration in milliseconds. */
  durationMs: number;
  /** Token count parsed from JR_RESULT output (for LLM jobs). */
  tokens: number | null;
  /** Additional result metadata parsed from JR_RESULT output. */
  resultMeta: string | null;
  /** Last N lines of stdout. */
  stdoutTail: string;
  /** Last N lines of stderr. */
  stderrTail: string;
  /** Error message if execution failed. */
  error: string | null;
}

/** Command resolution result. */
export interface ResolvedCommand {
  /** Command to execute. */
  command: string;
  /** Arguments to pass to the command. */
  args: string[];
}

/** Options for executing a job script. */
export interface ExecutionOptions {
  /** Path to the script file to execute. */
  script: string;
  /** Path to the SQLite database for job state access. */
  dbPath: string;
  /** Job identifier (passed as JR_JOB_ID env var). */
  jobId: string;
  /** Run identifier (passed as JR_RUN_ID env var). */
  runId: number;
  /** Optional execution timeout in milliseconds. */
  timeoutMs?: number;
  /** Optional custom command resolver (for extensibility). */
  commandResolver?: (script: string) => ResolvedCommand;
}

/** Ring buffer for capturing last N lines of output. */
class RingBuffer {
  private lines: string[] = [];
  constructor(private maxLines: number) {}

  append(line: string): void {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  getAll(): string {
    return this.lines.join('\n');
  }
}

/** Parse JR_RESULT:\{json\} lines from stdout to extract tokens and resultMeta. */
function parseResultLines(stdout: string): {
  tokens: number | null;
  resultMeta: string | null;
} {
  const lines = stdout.split('\n');
  let tokens: number | null = null;
  let resultMeta: string | null = null;

  for (const line of lines) {
    const match = /^JR_RESULT:(.+)$/.exec(line.trim());
    if (match) {
      try {
        const data = JSON.parse(match[1]) as {
          tokens?: number;
          meta?: string;
        };
        if (data.tokens !== undefined) tokens = data.tokens;
        if (data.meta !== undefined) resultMeta = data.meta;
      } catch {
        // Ignore parse errors
      }
    }
  }

  return { tokens, resultMeta };
}

/** Resolve the command and arguments for a script based on its file extension. */
function resolveCommand(script: string): ResolvedCommand {
  const ext = extname(script).toLowerCase();
  switch (ext) {
    case '.ps1':
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-File', script],
      };
    case '.cmd':
    case '.bat':
      return { command: 'cmd.exe', args: ['/c', script] };
    default:
      // .js, .mjs, .cjs, or anything else: run with node
      return { command: 'node', args: [script] };
  }
}

/**
 * Execute a job script as a child process. Captures output, parses metadata, enforces timeout.
 */
export function executeJob(
  options: ExecutionOptions,
): Promise<ExecutionResult> {
  const { script, dbPath, jobId, runId, timeoutMs, commandResolver } = options;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const stdoutBuffer = new RingBuffer(100);
    const stderrBuffer = new RingBuffer(100);

    const { command, args } = commandResolver
      ? commandResolver(script)
      : resolveCommand(script);
    const child = spawn(command, args, {
      env: {
        ...process.env,
        JR_DB_PATH: dbPath,
        JR_JOB_ID: jobId,
        JR_RUN_ID: String(runId),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    if (timeoutMs) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000); // Force kill after 5s
      }, timeoutMs);
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) stdoutBuffer.append(line);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) stderrBuffer.append(line);
      }
    });

    child.on('close', (exitCode) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const durationMs = Date.now() - startTime;
      const stdoutTail = stdoutBuffer.getAll();
      const stderrTail = stderrBuffer.getAll();
      const { tokens, resultMeta } = parseResultLines(stdoutTail);

      if (timedOut) {
        resolve({
          status: 'timeout',
          exitCode: null,
          durationMs,
          tokens: null,
          resultMeta: null,
          stdoutTail,
          stderrTail,
          error: `Job timed out after ${String(timeoutMs)}ms`,
        });
      } else if (exitCode === 0) {
        resolve({
          status: 'ok',
          exitCode,
          durationMs,
          tokens,
          resultMeta,
          stdoutTail,
          stderrTail,
          error: null,
        });
      } else {
        resolve({
          status: 'error',
          exitCode,
          durationMs,
          tokens,
          resultMeta,
          stdoutTail,
          stderrTail,
          error: stderrTail || `Exit code ${String(exitCode)}`,
        });
      }
    });

    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const durationMs = Date.now() - startTime;
      resolve({
        status: 'error',
        exitCode: null,
        durationMs,
        tokens: null,
        resultMeta: null,
        stdoutTail: stdoutBuffer.getAll(),
        stderrTail: stderrBuffer.getAll(),
        error: err.message,
      });
    });
  });
}
