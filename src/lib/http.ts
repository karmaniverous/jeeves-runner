/**
 * Shared HTTP utility for making POST requests.
 */

import type { IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/** Make an HTTP/HTTPS POST request. Returns the parsed JSON response body. */
export function httpPost(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 30000,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res: IncomingMessage) => {
        let responseBody = '';
        res.on('data', (chunk: Buffer) => {
          responseBody += chunk.toString();
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${String(res.statusCode)}: ${responseBody}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(responseBody) as unknown);
          } catch {
            reject(new Error(`Failed to parse JSON response: ${responseBody}`));
          }
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}
