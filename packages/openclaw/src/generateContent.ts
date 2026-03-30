/**
 * Generates the runner's TOOLS.md section content by querying the runner API.
 *
 * @module generateContent
 */

import { fetchJson } from '@karmaniverous/jeeves';

/** Status response from GET /status. */
interface RunnerStatus {
  status: string;
  version: string;
  uptime: number;
  totalJobs: number;
  running: number;
  failedRegistrations: number;
  okLastHour: number;
  errorsLastHour: number;
}

/**
 * Generate the runner's TOOLS.md section content.
 *
 * @remarks
 * Fetches status from the runner API and formats it as markdown.
 * Throws on connection failure — the ComponentWriter handles errors.
 *
 * @param baseUrl - Runner API base URL.
 * @returns Markdown content for the Runner section.
 */
export async function generateRunnerContent(baseUrl: string): Promise<string> {
  const data = (await fetchJson(`${baseUrl}/status`)) as RunnerStatus;

  const lines: string[] = [];

  lines.push(`jeeves-runner v${data.version} connected on ${baseUrl}.`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total jobs | ${String(data.totalJobs)} |`);
  lines.push(`| Running | ${String(data.running)} |`);
  lines.push(`| OK last hour | ${String(data.okLastHour)} |`);
  lines.push(`| Errors last hour | ${String(data.errorsLastHour)} |`);

  if (data.failedRegistrations > 0) {
    lines.push(
      `| Failed registrations | ${String(data.failedRegistrations)} |`,
    );
  }

  lines.push('');

  return lines.join('\n');
}
