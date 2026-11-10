/**
 * Writes runner-core's `openapi.json` from `RUNNER_CATALOG`. Run with `npm run openapi` after changing the catalog (the drift test fails until you do); release-it runs it after each version bump. The build never writes it.
 *
 * @module scripts/write-openapi
 */

import { writeOpenApiDocument } from '@karmaniverous/jeeves/openapi';

import { RUNNER_CATALOG } from '../src/catalog.js';
import { OPENAPI_FILE, openApiInfo } from './openapiInfo.js';

writeOpenApiDocument(RUNNER_CATALOG, openApiInfo(), OPENAPI_FILE);
console.log(`Wrote ${OPENAPI_FILE}`);
