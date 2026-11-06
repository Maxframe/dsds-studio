import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateText } from '@server/validator/adapter';
import { latest, packDir } from './helpers';

const version = latest?.version ?? '';

describe('validator adapter', () => {
  it('accepts the upstream starter kit', () => {
    const file = join(packDir(), 'examples/base/starter-kit.dsds.yaml');
    const result = validateText(readFileSync(file, 'utf8'), version, { filePath: file });
    expect(result.errors).toBe(0);
    expect(result.packVersion).toBe(version);
  });

  it('reports a parse error as a finding', () => {
    const result = validateText('a: [unclosed', version);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.message).toMatch(/could not parse/);
  });

  it('reports a non-mapping document', () => {
    expect(validateText('- a\n- b\n', version).ok).toBe(false);
  });

  it('returns rule id, pointer and fix for a semantic failure', () => {
    const file = join(packDir(), 'examples/invalid/DSDS-04-unique-entry-id.yaml');
    const result = validateText(readFileSync(file, 'utf8'), version, { filePath: file });
    const f = result.findings.find((x) => x.rule === 'DSDS-04');
    expect(f).toBeDefined();
    expect(f?.docs).toMatch(/dsds-04/);
  });

  // Our adapter must agree with upstream's own conformance suite for every fixture.
  const suite = JSON.parse(
    readFileSync(join(packDir(), 'schema/conformance-suite.json'), 'utf8'),
  ) as {
    fixtures: Array<{ file: string; rejectedBy: 'schema' | 'semantic'; expect: string[] }>;
  };

  describe.each(suite.fixtures)('conformance fixture $file', (fx) => {
    it('is rejected for the declared reason', () => {
      const file = join(packDir(), fx.file);
      const result = validateText(readFileSync(file, 'utf8'), version, {
        filePath: file,
        strict: true,
      });
      expect(result.ok).toBe(false);
      if (fx.rejectedBy === 'semantic') {
        const rules = new Set(result.findings.map((f) => f.rule));
        for (const id of fx.expect) expect(rules).toContain(id);
      } else {
        expect(result.findings.some((f) => f.rule === null)).toBe(true);
      }
    });
  });
});
