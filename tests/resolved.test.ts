import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi } from '@server/api';
import { Workspace } from '@server/workspace';
import type { RefTarget, ResolvedProject } from '@shared/types';

let ws: Workspace;
let api: ReturnType<typeof createApi>;
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

// A shared rule that states its level and statement, a definition, and a dialog that reuses the rule
// and uses a token. This is what the processing model (§4, §5) resolves.
const BASE = `schemaVersion: "0.23.1"
name: Demo
entries:
  - kind: system
    id: demo
    name: Demo
    description: A system.
  - kind: token
    id: color.action
    name: Action
    description: The action colour.
    tokenType: color
  - kind: component
    id: dialog
    name: Dialog
    description: A dialog.
    uses:
      - to: color.action
    sections:
      - kind: guidelines
        for: all
        items:
          - id: touch
            refs:
              - to: shared-a11y#touch-target
                rel: same-as
shared:
  - id: shared-a11y
    name: Shared accessibility
    description: Rules for everyone.
    sections:
      - kind: guidelines
        for: all
        items:
          - id: touch-target
            level: must
            statement: Touch targets are at least 44 by 44 points.
            checkedBy: manual
      - kind: definitions
        for: all
        items:
          - id: target
            term: Target
            definition: Where a pointer lands.
`;

beforeEach(async () => {
  ws = new Workspace(mkdtempSync(join(tmpdir(), 'dsds-resolved-')));
  api = createApi(ws);
  await api.request('/api/projects', json({ name: 'Demo' }));
  writeFileSync(join(ws.root, 'demo', 'demo.dsds.yaml'), BASE);
});

const resolved = async () =>
  (await (await api.request('/api/projects/demo/resolved')).json()) as ResolvedProject;
const targets = async () =>
  (await (await api.request('/api/projects/demo/targets')).json()) as RefTarget[];

describe('GET /resolved', () => {
  it('gives a reusing item its effective content and where it comes from (§4)', async () => {
    const dialog = (await resolved()).entries.dialog;
    const touch = dialog?.items.find((i) => i.address === 'touch-target' || i.address === 'touch');
    expect(touch).toMatchObject({
      type: 'item',
      reuses: 'shared-a11y#touch-target',
      origin: 'shared-a11y#touch-target',
      content: {
        level: 'must',
        statement: 'Touch targets are at least 44 by 44 points.',
        checkedBy: 'manual',
      },
    });
    expect(touch?.pointer).toBe('/sections/0/items/0');
  });

  it('lists what points at an entry, seen from the target (§5)', async () => {
    const { entries } = await resolved();
    expect(entries['color.action']?.incoming).toEqual([
      expect.objectContaining({ rel: 'uses', from: 'dialog', pointer: 'dialog/uses/0' }),
    ]);
    expect(entries['shared-a11y']?.incoming).toEqual([
      expect.objectContaining({ rel: 'same-as', from: 'dialog#touch', at: 'touch-target' }),
    ]);
    expect(entries.dialog?.incoming).toBeUndefined();
  });

  it('says which kind of section each item sits in', async () => {
    const items = (await resolved()).entries['shared-a11y']?.items ?? [];
    expect(items.find((i) => i.address === 'touch-target')?.sectionKind).toBe('guidelines');
    expect(items.find((i) => i.address === 'target')?.sectionKind).toBe('definitions');
  });

  it('404s for an unknown project', async () => {
    expect((await api.request('/api/projects/nope/resolved')).status).toBe(404);
  });
});

describe('GET /targets', () => {
  it('tells entries from items, and gives an item the kind of its section', async () => {
    const all = await targets();
    expect(all.find((t) => t.target === 'dialog')).toMatchObject({
      type: 'entry',
      label: 'Dialog',
    });
    expect(all.find((t) => t.target === 'shared-a11y#touch-target')).toMatchObject({
      type: 'item',
      sectionKind: 'guidelines',
    });
    expect(all.find((t) => t.target === 'shared-a11y#target')).toMatchObject({
      type: 'item',
      sectionKind: 'definitions',
    });
    expect(all.find((t) => t.target === 'dialog')?.sectionKind).toBeUndefined();
  });
});
