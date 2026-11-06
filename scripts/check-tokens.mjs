#!/usr/bin/env node
// Guardrail: visual values must come from design tokens. Fails if any CSS/TSX file under
// src/web (other than styles/tokens.css) contains a hex color, rgb()/hsl() or a raw px/rem/em value.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/web', import.meta.url).pathname;
const allowed = join(root, 'styles/tokens.css');
const patterns = [
  [/#[0-9a-fA-F]{3,8}\b/, 'hex color'],
  [/\b(rgb|rgba|hsl|hsla|oklch)\(/, 'color function'],
  [/(?<![\w-])\d*\.?\d+(px|rem|em)\b/, 'raw length'],
];
// 0 / 1px hairlines are common and harmless.
const ok = (line) => /\b1px\b/.test(line) && !/\d{2,}px/.test(line);

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx|ts)$/.test(f) && p !== allowed) files.push(p);
  }
})(root);

let bad = 0;
for (const file of files) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [re, what] of patterns) {
        if (re.test(line) && !ok(line)) {
          console.error(
            `${relative(process.cwd(), file)}:${i + 1}: ${what} outside tokens.css -> ${line.trim()}`,
          );
          bad++;
        }
      }
    });
}
if (bad) {
  console.error(
    `\n${bad} hardcoded visual value(s). Add a token to src/web/styles/tokens.css and use var(--token).`,
  );
  process.exit(1);
}
console.log('check:tokens ok');
