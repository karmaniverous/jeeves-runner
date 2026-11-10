/**
 * runner-core's committed OpenAPI 3.1 document for `RUNNER_CATALOG`, bundled as `RUNNER_OPENAPI_DOCUMENT` (the service serves it at `GET /openapi.json`; DD#93). Also published as the `@karmaniverous/jeeves-runner-core/openapi.json` sub-path for out-of-repo generators. Pure.
 *
 * @module openapi
 */

import document from '../openapi.json';

/**
 * The OpenAPI document generated from `RUNNER_CATALOG` (`npm run openapi`).
 *
 * @remarks
 * Typed loosely so runner-core's declarations don't depend on OpenAPI type
 * packages.
 */
export const RUNNER_OPENAPI_DOCUMENT: Readonly<Record<string, unknown>> =
  document;
