import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { EditOp, ValidationResult } from '@shared/types';
import { DsdsDocument } from './documents/document';
import { listPacks, packForSchemaVersion, PACKS_DIR } from './packs';
import { Project } from './projects/project';
import { Workspace } from './workspace';

export type { EditOp };

export function createApi(workspace: Workspace = new Workspace()): Hono {
  const app = new Hono();
  const fail = (message: string, status: 400 | 404 | 409 = 400) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/packs', (c) => c.json(listPacks()));

  // The bundled JSON Schema of a pack: the form renderer is driven by this.
  app.get('/api/packs/:version/schema', (c) => {
    const version = c.req.param('version');
    if (!listPacks().some((p) => p.version === version)) return fail('Unknown pack', 404);
    const text = readFileSync(join(PACKS_DIR, version, 'schema/dsds.bundled.schema.json'), 'utf8');
    return c.body(text, 200, { 'content-type': 'application/json' });
  });

  app.get('/api/projects', (c) => c.json(workspace.list()));

  app.post('/api/projects', async (c) => {
    const { name } = (await c.req.json().catch(() => ({}))) as { name?: string };
    const pack = listPacks()[0];
    if (!name?.trim()) return fail('Name is required');
    if (!pack) return fail('No schema pack installed. Run: npm run pack:add -- v0.23.1');
    try {
      return c.json(workspace.create(name, pack.version), 201);
    } catch (e) {
      return fail((e as Error).message, /exists/.test((e as Error).message) ? 409 : 400);
    }
  });

  // Whole-project overview: documents, entries, pack, and validation per document.
  app.get('/api/projects/:slug', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Unknown project', 404);
    const project = Project.load({ dir });
    const match = project.pack();
    const validation: Record<string, ValidationResult> = {};
    if (match)
      for (const [file, result] of project.validate(match.pack.version)) validation[file] = result;
    return c.json({
      slug: c.req.param('slug'),
      schemaVersion: project.schemaVersion,
      pack: match ? { version: match.pack.version, exact: match.exact } : null,
      documents: project.documents.map((d) => ({ path: d.path, format: d.format })),
      entries: project.entries(),
      problems: project.problems,
      validation,
    });
  });

  // Every `entryId` and `entryId#address` in the project, for the ref picker.
  app.get('/api/projects/:slug/targets', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Unknown project', 404);
    const project = Project.load({ dir });
    const match = project.pack();
    if (!match) return c.json([]);
    const resolved = project.resolve(match.pack.version);
    const names = new Map(project.entries().map((e) => [e.id, e.name]));
    const out: Array<{ target: string; label: string }> = [];
    for (const e of resolved.entries) {
      out.push({ target: e.id, label: names.get(e.id) ?? e.id });
      for (const item of e.items as Array<{ address?: string }>) {
        if (item.address) out.push({ target: `${e.id}#${item.address}`, label: item.address });
      }
    }
    return c.json(out);
  });

  app.get('/api/projects/:slug/file', (c) => {
    const abs = workspace.documentPath(c.req.param('slug'), c.req.query('path') ?? '');
    if (!abs) return fail('Invalid path', 400);
    try {
      const doc = DsdsDocument.parse(readFileSync(abs, 'utf8'), undefined);
      return c.json({ format: doc.format, text: doc.toText(), value: doc.toValue() });
    } catch {
      return fail('File not found', 404);
    }
  });

  // Apply edits by JSON Pointer through the lossless document model, write, and re-validate.
  app.post('/api/projects/:slug/file/ops', async (c) => {
    const slug = c.req.param('slug');
    const path = c.req.query('path') ?? '';
    const abs = workspace.documentPath(slug, path);
    if (!abs) return fail('Invalid path', 400);
    const { ops } = (await c.req.json().catch(() => ({}))) as { ops?: EditOp[] };
    if (!Array.isArray(ops) || ops.length === 0) return fail('ops must be a non-empty list');
    let doc: DsdsDocument;
    try {
      doc = DsdsDocument.parse(readFileSync(abs, 'utf8'));
    } catch {
      return fail('File not found', 404);
    }
    try {
      for (const op of ops) {
        if (op.op === 'set') doc.setAt(op.pointer, op.value);
        else if (op.op === 'remove') doc.removeAt(op.pointer);
        else if (op.op === 'append') doc.appendAt(op.pointer, op.value);
        else if (op.op === 'move') doc.moveAt(op.pointer, op.from, op.to);
        else return fail('Unknown op');
      }
    } catch (e) {
      return fail((e as Error).message);
    }
    writeFileSync(abs, doc.toText());
    const dir = workspace.dirOf(slug) as string;
    const project = Project.load({ dir });
    const match = project.pack();
    const validation = match ? project.validate(match.pack.version).get(path) : undefined;
    return c.json({ value: doc.toValue(), text: doc.toText(), validation: validation ?? null });
  });

  // Replace a file's whole text (raw editor). Refuses text that doesn't parse.
  app.put('/api/projects/:slug/file', async (c) => {
    const slug = c.req.param('slug');
    const path = c.req.query('path') ?? '';
    const abs = workspace.documentPath(slug, path);
    if (!abs) return fail('Invalid path', 400);
    const { text } = (await c.req.json().catch(() => ({}))) as { text?: string };
    if (typeof text !== 'string') return fail('text is required');
    const doc = DsdsDocument.parse(text);
    if (doc.parseErrors.length) return fail(`Does not parse: ${doc.parseErrors[0]}`);
    writeFileSync(abs, text);
    const project = Project.load({ dir: workspace.dirOf(slug) as string });
    const match = project.pack();
    const validation = match ? project.validate(match.pack.version).get(path) : undefined;
    return c.json({ value: doc.toValue(), text, validation: validation ?? null });
  });

  // Remove a whole document file (a standalone entry). Moved to .dsds-trash/, not deleted.
  app.delete('/api/projects/:slug/file', (c) => {
    try {
      const trashed = workspace.trash(c.req.param('slug'), c.req.query('path') ?? '');
      return c.json({ trashed });
    } catch (e) {
      return fail((e as Error).message, /not found/i.test((e as Error).message) ? 404 : 400);
    }
  });

  // For tests/tools: which pack a version maps to.
  app.get('/api/pack-for/:version', (c) => {
    const match = packForSchemaVersion(c.req.param('version'));
    return match ? c.json(match) : fail('No pack covers that version', 404);
  });

  return app;
}
