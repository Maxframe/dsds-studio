#!/usr/bin/env node
// Builds a realistic example project in workspace/ from the examples shipped with the schema pack,
// so there is something rich to open in the app: `npm run example:create`.
// It is a copy; edit it freely. Refuses to overwrite an existing project.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packs = readdirSync(join(root, 'packs')).sort();
const version = packs.at(-1);
if (!version) throw new Error('No schema pack installed. Run: npm run pack:add -- v0.23.1');
const examples = join(root, 'packs', version, 'examples');
const slug = 'example-acme-design';
const dest = join(root, process.env.DSDS_WORKSPACE ?? 'workspace', slug);
if (existsSync(dest)) {
  console.error(`${dest} already exists; remove it first if you want to rebuild it.`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });

// The base document: system, tokens, two themes, a button component and shared accessibility rules.
cpSync(join(examples, 'base/starter-kit.dsds.yaml'), join(dest, 'acme-design.dsds.yaml'));
// Files the base document points at (token files, tests).
// (starter-kit-fragments/ are inputs for the compose tool, not documents, so they stay out.)
for (const d of readdirSync(join(examples, 'base'), { withFileTypes: true })) {
  if (d.isDirectory() && d.name !== 'starter-kit-fragments')
    cpSync(join(examples, 'base', d.name), join(dest, d.name), { recursive: true });
}

// Standalone entries (components, tokens, a theme, patterns...) keep their relative file paths.
// Entries whose id the base document already defines are skipped: an id must be unique (DSDS-04).
const SKIP = new Set(['button.yaml', 'color-action-primary.yaml', 'dark.yaml']);
const entries = join(dest, 'entries');
mkdirSync(entries);
for (const d of readdirSync(join(examples, 'entries'), { withFileTypes: true })) {
  const from = join(examples, 'entries', d.name);
  if (d.isDirectory()) cpSync(from, join(entries, d.name), { recursive: true });
  else if (SKIP.has(d.name)) continue;
  else if (d.name.endsWith('.yaml')) {
    cpSync(from, join(entries, d.name.replace(/\.yaml$/, '.dsds.yaml')));
  } else cpSync(from, join(entries, d.name));
}

execFileSync('git', ['init', '-q'], { cwd: dest });
console.log(
  `Created ${dest} (schema ${version}, ${readFileSync(join(dest, 'acme-design.dsds.yaml'), 'utf8').split('\n').length} lines in the base document)`,
);
