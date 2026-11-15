import { describe, expect, it } from 'vitest';
import { decisionTemplate } from '@shared/decision';
import { validateText } from '@server/validator/adapter';
import { latest } from './helpers';

const version = latest?.version ?? '';

describe("decision template against the pack's own validator", () => {
  const doc = (entry: unknown) =>
    [
      `schemaVersion: "${version}"`,
      'name: Demo',
      'entries:',
      '  - kind: system',
      '    id: demo',
      '    name: Demo',
      '    description: A system.',
      `  - ${JSON.stringify(entry)}`,
      '',
    ].join('\n');

  it('validates with no errors', () => {
    const result = validateText(
      doc(decisionTemplate('adr-0001-x', 'Use X', '2026-11-11')),
      version,
    );
    expect(result.errors).toBe(0);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('is still valid once the sections are filled in and the record is superseded', () => {
    const t = decisionTemplate('adr-0001-x', 'Use X', '2026-11-11');
    const filled = {
      ...t,
      metadata: {
        ...t.metadata,
        status: {
          status: 'deprecated',
          deprecationNotice: 'Superseded by adr-0002-y.',
          replacedBy: [{ to: 'adr-0002-y' }],
        },
      },
      sections: [
        {
          ...t.sections[0],
          freeform: t.sections[0]?.freeform.map((f) => ({ ...f, body: 'Text.' })),
        },
      ],
    };
    const successor = decisionTemplate('adr-0002-y', 'Use Y', '2026-11-12');
    const text = doc(filled) + `  - ${JSON.stringify(successor)}\n`;
    expect(validateText(text, version).errors).toBe(0);
  });
});
