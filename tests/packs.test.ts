import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { listPacks, PACKS_DIR } from '@server/packs';

// A pack is only trusted if upstream's own conformance suite passes against it.
describe.each(listPacks())('pack $version', (pack) => {
  const dir = join(PACKS_DIR, pack.version);

  it('passes the upstream conformance suite', () => {
    execFileSync('node', ['scripts/validate/conformance-test.js'], { cwd: dir, stdio: 'pipe' });
  });

  it('validates its own starter kit example', () => {
    const out = execFileSync(
      'node',
      ['scripts/validate/validate.js', 'examples/base/starter-kit.dsds.yaml', '--json'],
      { cwd: dir, stdio: 'pipe' },
    ).toString();
    expect(out).toBeTruthy();
  });
});

describe('listPacks', () => {
  it('returns an array', () => {
    expect(Array.isArray(listPacks())).toBe(true);
  });
});
