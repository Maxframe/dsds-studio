import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Project } from '@server/projects/project';
import { exampleFiles, latest } from './helpers';

const version = latest?.version ?? '';
const button = exampleFiles(/^button\.yaml$/)[0] ?? '';

/** A one-file project: the pack's own Button example, optionally changed. */
function project(edit: (text: string) => string = (t) => t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsds-lint-'));
  writeFileSync(join(dir, 'button.dsds.yaml'), edit(readFileSync(button, 'utf8')));
  return Project.load({ dir });
}

describe("advisory lint (the pack's own lint-docs.js)", () => {
  it('reports nothing for a pack example that is clean', () => {
    const result = project().validate(version).get('button.dsds.yaml');
    expect(result?.advice).toEqual([]);
  });

  it('reports advisory findings separately from validation findings', () => {
    const before = project().validate(version).get('button.dsds.yaml');
    // Dropping `framing: when-to-use` leaves the component with no "when to use" guidance (DSDS-15).
    const after = project((t) => t.replace('    framing: when-to-use\n', ''))
      .validate(version)
      .get('button.dsds.yaml');
    const finding = after?.advice?.find((f) => f.rule === 'DSDS-15');
    expect(finding).toMatchObject({ severity: 'warning', fix: expect.any(String) });
    // Advice never changes the validation verdict or its counts.
    expect([after?.ok, after?.errors, after?.warnings]).toEqual([
      before?.ok,
      before?.errors,
      before?.warnings,
    ]);
  });

  it('lints again when the file changes, and not for an unchanged file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsds-lint-'));
    const file = join(dir, 'button.dsds.yaml');
    const text = readFileSync(button, 'utf8');
    writeFileSync(file, text);
    const advice = () => Project.load({ dir }).validate(version).get('button.dsds.yaml')?.advice;
    expect(advice()).toEqual([]);
    writeFileSync(file, text.replace('    framing: when-to-use\n', ''));
    expect(advice()?.map((f) => f.rule)).toContain('DSDS-15');
    writeFileSync(file, text);
    expect(advice()).toEqual([]);
  });
});
