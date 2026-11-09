// Install dependencies from the registry npm is configured to use (e.g. a company mirror), and
// only if that fails, retry from the public registry. npm has no built-in fallback of its own.
// The lockfile holds public URLs and integrity hashes, so both routes yield identical packages.
import { spawnSync } from 'node:child_process';

const PUBLIC = 'https://registry.npmjs.org/';
const run = (args) =>
  spawnSync('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });

const configured = spawnSync('npm', ['config', 'get', 'registry'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
}).stdout.trim();

if (run(['install']).status === 0) process.exit(0);

if (configured.replace(/\/$/, '') === PUBLIC.replace(/\/$/, '')) process.exit(1);
console.warn(`\nInstall from ${configured} failed. Retrying from ${PUBLIC} ...`);
console.warn('Check that your organisation allows installing from the public registry.\n');
process.exit(run(['install', '--registry', PUBLIC]).status ?? 1);
