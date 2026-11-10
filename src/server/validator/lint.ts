import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Finding } from '@shared/types';
import { PACKS_DIR } from '../packs';

/**
 * The pack's advisory tier ("is this documentation good?", scripts/validate/lint-docs.js). The
 * script is a CLI that parses argv and exits, so it is run as the pack ships it, once for all files
 * that changed, instead of being reimplemented (rule 2). It never blocks: if it cannot run, there is
 * simply no advice.
 */
const cache = new Map<string, Finding[]>();

const keyOf = (version: string, abs: string): string | null => {
  try {
    const s = statSync(abs);
    return `${version}|${abs}|${s.mtimeMs}|${s.size}`;
  } catch {
    return null;
  }
};

interface LintReport {
  files?: Array<{ file: string; findings?: Finding[] }>;
}

/** Advisory findings per absolute file path. Files the linter could not read map to `[]`. */
export function lintFiles(
  packVersion: string,
  cwd: string,
  absPaths: string[],
  packsDir = PACKS_DIR,
): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  const stale: string[] = [];
  for (const abs of absPaths) {
    const key = keyOf(packVersion, abs);
    const hit = key ? cache.get(key) : undefined;
    if (hit) out.set(abs, hit);
    else stale.push(abs);
  }
  if (stale.length > 0) {
    const script = join(packsDir, packVersion, 'scripts/validate/lint-docs.js');
    const run = spawnSync(process.execPath, [script, '--json', ...stale], {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    let report: LintReport = {};
    try {
      report = JSON.parse(run.stdout) as LintReport;
    } catch {
      /* no advice rather than an error */
    }
    const byFile = new Map(report.files?.map((f) => [resolve(cwd, f.file), f.findings ?? []]));
    for (const abs of stale) {
      const findings = (byFile.get(abs) ?? []).map((f) => ({ ...f, severity: 'warning' as const }));
      out.set(abs, findings);
      const key = keyOf(packVersion, abs);
      if (key && byFile.has(abs)) cache.set(key, findings);
    }
  }
  return out;
}
