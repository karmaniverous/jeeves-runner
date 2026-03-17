/**
 * @module plugin/runnerContentCache
 * Synchronous TOOLS.md content generator backed by an async-refreshing cache.
 */

import { generateRunnerContent } from './generateContent.js';

export interface RunnerContentCache {
  /** Get the latest cached content and trigger a background refresh. */
  getContent(): string;
  /** Force a refresh now. */
  refresh(): Promise<void>;
}

/**
 * Create a cache for runner TOOLS.md content.
 *
 * @remarks
 * `JeevesComponent.generateToolsContent()` must be synchronous, so we keep
 * the last known content in memory and refresh it asynchronously.
 */
export function createRunnerContentCache(baseUrl: string): RunnerContentCache {
  let content = 'Fetching runner status...';
  let inFlight: Promise<void> | null = null;

  async function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        content = await generateRunnerContent(baseUrl);
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function getContent(): string {
    // Fire-and-forget refresh so the *next* cycle is fresher.
    void refresh();
    return content;
  }

  return { getContent, refresh };
}
