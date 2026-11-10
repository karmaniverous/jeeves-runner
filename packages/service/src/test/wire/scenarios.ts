/**
 * @module test/wire/scenarios
 * Wire scenarios for every runner route and outcome (spec 4B.2): standard and job routes here, queue and state routes in `scenariosInspect`. Run by `wireRun`; no assertions.
 */

import { SCENARIOS_INSPECT } from './scenariosInspect.js';
import { addRecentRuns } from './wireSeed.js';
import {
  get,
  patch,
  post,
  put,
  scenario,
  type WireScenario,
} from './wireTypes.js';

/** A valid job body with only the required fields. */
const MINIMAL_JOB = {
  id: 'gamma',
  name: 'Gamma',
  schedule: '0 0 * * *',
  script: '/scripts/gamma.js',
};

/** A valid job body with every field. */
const FULL_JOB = {
  ...MINIMAL_JOB,
  id: 'delta',
  source_type: 'inline',
  type: 'session',
  timeout_seconds: 30,
  overlap_policy: 'allow',
  enabled: false,
  description: 'Delta',
  on_failure: 'C1',
  on_success: null,
  output_channel: 'C2',
  env: { A: '1' },
  args: ['--x'],
};

/** Standard routes: status, config, config apply. */
const STANDARD: WireScenario[] = [
  get('status', '/status'),
  scenario('status HEAD', 'HEAD', '/status'),
  get('status busy', '/status', {
    state: { running: ['alpha'], failedRegistrations: ['beta'] },
    setup: addRecentRuns,
  }),
  get('config full', '/config'),
  get('config jsonpath', '/config?path=%24.port'),
  get('config jsonpath no match', '/config?path=%24.nope'),
  get('config invalid jsonpath', '/config?path=%24%5B((('),
  get('config unknown query key', '/config?foo=1'),
  post('configApply patch', '/config/apply', { patch: { maxConcurrency: 3 } }),
  post('configApply replace', '/config/apply', {
    patch: { port: 1999 },
    replace: true,
  }),
  post('configApply invalid config', '/config/apply', {
    patch: { maxConcurrency: 'many' },
  }),
  post('configApply unknown key', '/config/apply', {
    patch: { runRetentionDays: 9 },
    extra: true,
  }),
  post('configApply empty body', '/config/apply', {}),
  post('configApply non-object patch', '/config/apply', { patch: [1] }),
  scenario('configApply no body', 'POST', '/config/apply'),
];

/** Job collection and item routes. */
const JOBS: WireScenario[] = [
  get('listJobs', '/jobs'),
  get('listJobs empty', '/jobs', {
    setup: (db) => {
      db.exec('DELETE FROM runs; DELETE FROM jobs;');
    },
  }),
  post('createJob minimal', '/jobs', MINIMAL_JOB),
  post('createJob full', '/jobs', FULL_JOB),
  post('createJob unknown key', '/jobs', { ...MINIMAL_JOB, colour: 'red' }),
  post('createJob invalid body', '/jobs', { id: 'x', name: '' }),
  post('createJob bad schedule', '/jobs', {
    ...MINIMAL_JOB,
    schedule: 'every so often',
  }),
  post('createJob duplicate id', '/jobs', { ...MINIMAL_JOB, id: 'alpha' }),
  scenario('createJob no body', 'POST', '/jobs'),
  get('jobDetail', '/jobs/alpha'),
  get('jobDetail inline session job', '/jobs/beta'),
  get('jobDetail not found', '/jobs/nope'),
  get('jobDetail encoded id', '/jobs/a%20b%2Fc'),
  patch('updateJob', '/jobs/alpha', {
    name: 'Alpha renamed',
    timeout_seconds: 2,
    enabled: false,
    env: { B: '2' },
  }),
  patch('updateJob empty body', '/jobs/alpha', {}),
  patch('updateJob unknown key', '/jobs/alpha', { colour: 'red' }),
  patch('updateJob invalid body', '/jobs/alpha', { name: '' }),
  patch('updateJob bad schedule', '/jobs/alpha', { schedule: 'nope' }),
  patch('updateJob not found', '/jobs/nope', { name: 'x' }),
  patch('updateJob invalid body not found', '/jobs/nope', { name: '' }),
  scenario('updateJob no body', 'PATCH', '/jobs/alpha'),
  scenario('deleteJob', 'DELETE', '/jobs/alpha'),
  scenario('deleteJob not found', 'DELETE', '/jobs/nope'),
  patch('enableJob', '/jobs/beta/enable', {}),
  scenario('enableJob no body', 'PATCH', '/jobs/beta/enable'),
  patch('enableJob body ignored', '/jobs/beta/enable', { enabled: false }),
  patch('enableJob not found', '/jobs/nope/enable', {}),
  patch('disableJob', '/jobs/alpha/disable', {}),
  patch('disableJob not found', '/jobs/nope/disable', {}),
  put('updateScript', '/jobs/alpha/script', { script: '/scripts/new.js' }),
  put('updateScript with source_type', '/jobs/alpha/script', {
    script: 'console.log(2)',
    source_type: 'inline',
  }),
  put('updateScript invalid body', '/jobs/alpha/script', { script: '' }),
  put('updateScript bad source_type', '/jobs/alpha/script', {
    script: 'x',
    source_type: 'url',
  }),
  put('updateScript not found', '/jobs/nope/script', { script: 'x' }),
  post('triggerJob', '/jobs/alpha/run', {}),
  scenario('triggerJob no body', 'POST', '/jobs/alpha/run'),
  post(
    'triggerJob timeout result',
    '/jobs/alpha/run',
    {},
    {
      state: { trigger: 'timeout' },
    },
  ),
  post(
    'triggerJob not found',
    '/jobs/nope/run',
    {},
    {
      state: { trigger: 'notFound' },
    },
  ),
  post(
    'triggerJob at maxConcurrency',
    '/jobs/alpha/run',
    {},
    {
      state: { trigger: 'maxConcurrency' },
    },
  ),
  post(
    'triggerJob other error',
    '/jobs/alpha/run',
    {},
    {
      state: { trigger: 'error' },
    },
  ),
  post(
    'triggerJob non-Error rejection',
    '/jobs/alpha/run',
    {},
    {
      state: { trigger: 'nonError' },
    },
  ),
  get('jobRuns', '/jobs/alpha/runs'),
  get('jobRuns limit', '/jobs/alpha/runs?limit=1'),
  get('jobRuns limit negative', '/jobs/alpha/runs?limit=-1'),
  get('jobRuns limit not a number', '/jobs/alpha/runs?limit=abc'),
  get('jobRuns limit fraction', '/jobs/alpha/runs?limit=1.5'),
  get('jobRuns limit trailing text', '/jobs/alpha/runs?limit=1abc'),
  get('jobRuns limit empty', '/jobs/alpha/runs?limit='),
  get('jobRuns repeated limit', '/jobs/alpha/runs?limit=1&limit=2'),
  get('jobRuns unknown query key', '/jobs/alpha/runs?colour=red'),
  get('jobRuns unknown job', '/jobs/nope/runs'),
  get('unknown route', '/nope'),
];

/** Every scenario, in run order. */
export const WIRE_SCENARIOS: readonly WireScenario[] = [
  ...STANDARD,
  ...JOBS,
  ...SCENARIOS_INSPECT,
];
