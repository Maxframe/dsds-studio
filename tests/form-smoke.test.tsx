// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { DsdsDocument, formatFromFilename } from '@server/documents/document';
import { SchemaBundle, effective, nodeOf, propertyOf, type JsonSchema } from '@shared/schema';
import type { EditOp } from '@shared/types';
import { FormProvider, type FormContext } from '../src/web/form/context';
import { SchemaField } from '../src/web/form/SchemaField';
import './dom-polyfills';
import { exampleFiles, packDir } from './helpers';

// Smoke test: the entry form must render every entry of the pack's own valid examples without
// crashing, and none of its "+ Add" buttons may put an empty value into the document. Examples
// are the one body of real documents that covers every kind the schema offers, so a schema change
// the form cannot cope with shows up here.
const bundle = new SchemaBundle(
  JSON.parse(
    readFileSync(join(packDir(), 'schema/dsds.bundled.schema.json'), 'utf8'),
  ) as JsonSchema,
);
const entryItems = propertyOf(
  bundle,
  effective(bundle, nodeOf(bundle.documentFragment()), {}),
  'entries',
  {},
)!.items!;

afterEach(cleanup);

interface Case {
  name: string;
  file: string;
  /** Where the entry sits in its document: `/entries/2`, or '' for a standalone entry file. */
  pointer: string;
}

/** Every entry in the valid examples, in base documents and in standalone entry files. */
function cases(): Case[] {
  const out: Case[] = [];
  const files = exampleFiles(/\.(ya?ml|dsds\.json)$/).filter((f) => !f.includes('/invalid/'));
  for (const file of files) {
    const value = DsdsDocument.parse(
      readFileSync(file, 'utf8'),
      formatFromFilename(file),
    ).toValue();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const name = file.split('/examples/')[1] as string;
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.entries)) {
      obj.entries.forEach((_, i) =>
        out.push({ name: `${name} #${i}`, file, pointer: `/entries/${i}` }),
      );
    } else if (typeof obj.kind === 'string') {
      out.push({ name, file, pointer: '' });
    }
  }
  return out;
}

/**
 * Paths of values an Add button must never write: null, undefined, and `{}`. A blank string is the
 * deliberate starting value for a required text field (the user types into it; see form.test.tsx),
 * and `[]` starts a list, so neither counts.
 */
function emptyValues(value: unknown, path = ''): string[] {
  if (value === undefined || value === null) return [path || '(root)'];
  if (Array.isArray(value)) return value.flatMap((v, i) => emptyValues(v, `${path}/${i}`));
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return [path || '(root)'];
    return entries.flatMap(([k, v]) => emptyValues(v, `${path}/${k}`));
  }
  return [];
}

function Harness({ c, doc, log }: { c: Case; doc: DsdsDocument; log: EditOp[] }) {
  const [, bump] = useState(0);
  const ctx: FormContext = {
    bundle,
    apply: async (ops) => {
      for (const op of ops) {
        log.push(op);
        const at = op.pointer;
        if (op.op === 'set') doc.setAt(at, op.value);
        else if (op.op === 'remove') doc.removeAt(at);
        else if (op.op === 'append') doc.appendAt(at, op.value);
        else doc.moveAt(at, op.from, op.to);
      }
      bump((n) => n + 1);
    },
    findings: [],
    targets: [],
    usage: () => new Map(),
    namespace: 'acme',
    valueAt: (pointer) => doc.getAt(pointer),
    reused: () => undefined,
    requestIdChange: (_from, _to, done) => done.commit(),
    succession: () => undefined,
    focus: null,
  };
  return (
    <FormProvider value={ctx}>
      <SchemaField node={entryItems} value={doc.getAt(c.pointer)} pointer={c.pointer} />
    </FormProvider>
  );
}

const all = cases();

describe('entry form smoke test (pack examples)', () => {
  it('found entries to render', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all.map((c) => [c.name, c] as const))(
    '%s renders, and its Add buttons add no null or empty-object value',
    async (_name, c) => {
      const doc = DsdsDocument.parse(readFileSync(c.file, 'utf8'), formatFromFilename(c.file));
      const log: EditOp[] = [];
      const user = userEvent.setup();
      render(<Harness c={c} doc={doc} log={log} />);

      const adds = screen.queryAllByRole('button', { name: /^\+ Add / });
      for (const button of adds) {
        if (!button.isConnected) continue;
        const before = log.length;
        await act(async () => {
          await user.click(button);
        });
        const empties = log
          .slice(before)
          .filter((op): op is Extract<EditOp, { value: unknown }> => 'value' in op)
          .flatMap((op) => emptyValues(op.value).map((p) => `${op.pointer}${p}`));
        expect(
          empties,
          `"${button.textContent}" added a null or empty-object value: ${JSON.stringify(log.slice(before))}`,
        ).toEqual([]);
      }
    },
  );
});
