#!/usr/bin/env node
// Adds a DSDS schema pack: `npm run pack:add -- v0.23.1`
//
// A pack is a frozen, self-contained copy of one released DSDS version: its schema, rule catalog,
// the reference validator/resolver/formatter/migrations from that tag, and its examples. The app
// never edits a pack. To support a new spec release, add a new pack; old packs stay untouched.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = 'https://github.com/somerandomdude/design-system-documentation-schema';
const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+(\.\d+)?$/.test(tag)) {
  console.error('Usage: npm run pack:add -- v<major>.<minor>.<patch>');
  process.exit(1);
}
const version = tag.slice(1);
const packDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs', version);
if (existsSync(packDir)) {
  console.error(
    `Pack ${version} already exists. Packs are immutable; delete it manually to rebuild.`,
  );
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'dsds-pack-'));
try {
  execFileSync('git', ['clone', '--depth', '1', '--branch', tag, REPO, tmp], { stdio: 'inherit' });
  const commit = execFileSync('git', ['-C', tmp, 'rev-parse', 'HEAD']).toString().trim();
  mkdirSync(packDir, { recursive: true });
  // Keep upstream's relative layout: its scripts locate the schema via ../schema.
  for (const p of ['schema', 'scripts', 'examples', 'LICENSE', 'CHANGELOG']) {
    if (existsSync(join(tmp, p))) cpSync(join(tmp, p), join(packDir, p), { recursive: true });
  }
  const upstreamPkg = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8'));
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify(
      { version: upstreamPkg.version, tag, commit, addedAt: new Date().toISOString() },
      null,
      2,
    ) + '\n',
  );
  // Upstream scripts are CommonMark `.js`; our root is "type": "module". Scope them to commonjs.
  writeFileSync(join(packDir, 'package.json'), '{ "type": "commonjs" }\n');
  console.log(`Added pack ${version} (${commit.slice(0, 7)}) at packs/${version}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
