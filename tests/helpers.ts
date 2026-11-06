import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listPacks, PACKS_DIR } from '@server/packs';

export const packs = listPacks();
export const latest = packs[0];
if (!latest) throw new Error('No schema pack installed. Run: npm run pack:add -- v0.23.1');
export const packDir = (version = latest.version) => join(PACKS_DIR, version);

/** All files under a pack's examples/ whose name matches `re`. */
export function exampleFiles(re: RegExp, version = latest?.version ?? ''): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (re.test(f)) out.push(p);
    }
  })(join(packDir(version), 'examples'));
  return out;
}
