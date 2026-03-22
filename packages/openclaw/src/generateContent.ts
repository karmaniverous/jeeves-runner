/**
 * Generates the runner's TOOLS.md section content by querying the runner API.
 *
 * @module generateContent
 */

import { fetchJson } from '@karmaniverous/jeeves';

/** Stats response from GET /stats. */
interface RunnerStats {
  totalJobs: number;
  running: number;
  failedRegistrations: number;
  okLastHour: number;
  errorsLastHour: number;
}

/** Job summary from GET /jobs. */
interface JobSummary {
  id: string;
  name: string;
  enabled: boolean;
  schedule: string;
  source_type?: string;
  lastRun?: {
    status: string;
    finished_at?: string;
  };
}

/** Detect whether a schedule string is rrstack JSON or cron. */
function scheduleFormat(schedule: string): 'rrstack' | 'cron' {
  try {
    const parsed: unknown = JSON.parse(schedule);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return 'rrstack';
    }
  } catch {
    // Not JSON — treat as cron
  }
  return 'cron';
}

/** Format a schedule for display: backtick-wrap cron, label rrstack. */
function formatSchedule(schedule: string): string {
  if (scheduleFormat(schedule) === 'rrstack') {
    return '*(rrstack)*';
  }
  return `\`${schedule}\``;
}

/**
 * Generate the runner's TOOLS.md section content.
 *
 * @param baseUrl - Runner API base URL.
 * @returns Markdown content for the Runner section.
 */
export async function generateRunnerContent(baseUrl: string): Promise<string> {
  try {
    const [statsRaw, jobsRaw] = await Promise.all([
      fetchJson(`${baseUrl}/stats`),
      fetchJson(`${baseUrl}/jobs`),
    ]);

    const stats = statsRaw as RunnerStats;

    const jobs = (() => {
      if (Array.isArray(jobsRaw)) return jobsRaw as JobSummary[];
      if (jobsRaw && typeof jobsRaw === 'object' && 'jobs' in jobsRaw) {
        const candidate = (jobsRaw as { jobs?: unknown }).jobs;
        if (Array.isArray(candidate)) return candidate as JobSummary[];
      }
      return [];
    })();

    const lines: string[] = [];

    // Health summary
    lines.push(`jeeves-runner connected on ${baseUrl}.`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total jobs | ${String(stats.totalJobs)} |`);
    lines.push(`| Running | ${String(stats.running)} |`);
    lines.push(`| OK last hour | ${String(stats.okLastHour)} |`);
    lines.push(`| Errors last hour | ${String(stats.errorsLastHour)} |`);

    if (stats.failedRegistrations > 0) {
      lines.push(
        `| Failed registrations | ${String(stats.failedRegistrations)} |`,
      );
    }

    lines.push('');

    // Job table
    if (Array.isArray(jobs) && jobs.length > 0) {
      lines.push('### Jobs');
      lines.push('');
      lines.push('| Job | Schedule | Status | Last Run |');
      lines.push('|-----|----------|--------|----------|');

      for (const job of jobs) {
        const enabled = job.enabled ? '' : ' *(disabled)*';
        const status = job.lastRun?.status ?? '—';
        const lastRun = job.lastRun?.finished_at
          ? new Date(job.lastRun.finished_at).toISOString()
          : '—';
        const sched = formatSchedule(job.schedule);
        const sourceTag = job.source_type === 'inline' ? ' *(inline)*' : '';
        lines.push(
          `| ${job.name}${enabled}${sourceTag} | ${sched} | ${status} | ${lastRun} |`,
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  } catch {
    // Service unreachable — return action-required block
    return [
      `> **ACTION REQUIRED: jeeves-runner is unreachable.**`,
      `> The runner API at ${baseUrl} is down or not configured.`,
      `>`,
      `> **Troubleshooting:**`,
      `> - Check if the JeevesRunner service is running`,
      `> - Verify the apiUrl in plugins.entries.jeeves-runner-openclaw.config`,
      `> - Start the jeeves-runner service (NSSM / Services / systemd)`,
    ].join('\n');
  }
}
