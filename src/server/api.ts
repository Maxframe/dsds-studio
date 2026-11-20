import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Hono } from 'hono';
import type { EditOp, LinkRequest, RefTarget, ValidationResult } from '@shared/types';
import { DsdsDocument } from './documents/document';
import { applyOpsToFile, FileNotFound } from './documents/edit';
import { inspectFolder, listFolders } from './links';
import { listPacks, packForSchemaVersion, PACKS_DIR } from './packs';
import { diffRevisions } from './projects/diff';
import { stampChanged } from './projects/stamp';
import { Project } from './projects/project';
import { resolvedView } from './projects/resolved';
import {
  discardDraft,
  draftOf,
  hasVersion,
  headVersion,
  isVersion,
  listVersions,
  nameVersion,
  restoreVersion,
  saveVersion,
  tagExists,
  tagVersion,
} from './projects/versions';
import { Workspace } from './workspace';

export type { EditOp };

/** The system's own version, offered as a tag until a version carries it. */
function suggestedTag(dir: string): string | null {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  for (const d of Project.load({ dir }).documents) {
    const value = d.doc.toValue();
    const candidates = isRecord(value) ? (value.kind ? [value] : (value.entries as unknown[])) : [];
    for (const e of Array.isArray(candidates) ? candidates : []) {
      if (!isRecord(e) || e.kind !== 'system' || !isRecord(e.metadata)) continue;
      const v = e.metadata.version;
      if (typeof v === 'string' && v.trim() && !tagExists(dir, v.trim())) return v.trim();
    }
  }
  return null;
}

export function createApi(workspace: Workspace = new Workspace()): Hono {
  const app = new Hono();
  const fail = (message: string, status: 400 | 404 | 409 = 400) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  // What each document looked like the last time this app read or wrote it. A save of whole text
  // (the code panel) is refused when the file on disk differs, for example after a `git pull`.
  const seen = new Map<string, string>();
  const seenKey = (slug: string, path: string) => `${slug}\0${path}`;
  const digest = (text: string) => createHash('sha1').update(text).digest('hex');
  const remember = (slug: string, path: string, text: string) =>
    seen.set(seenKey(slug, path), digest(text));
  const forget = (slug: string) => {
    for (const k of [...seen.keys()]) if (k.startsWith(`${slug}\0`)) seen.delete(k);
  };

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

  // The folder picker: subfolders of a folder on this machine. Only lists; opening a folder is
  // a separate, explicit step (`POST /api/projects/link`).
  app.get('/api/fs/folders', (c) => {
    try {
      return c.json(listFolders(c.req.query('path')));
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  // Suggestions for the setup dialog: where documents and tokens seem to be in a folder.
  app.get('/api/fs/inspect', (c) => {
    try {
      return c.json(inspectFolder(c.req.query('path') ?? ''));
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  // Open a folder from anywhere on disk as a project (M3c).
  app.post('/api/projects/link', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<LinkRequest>;
    const pack = listPacks()[0];
    if (!pack) return fail('No schema pack installed. Run: npm run pack:add -- v0.23.1');
    try {
      const result = workspace.link(
        {
          root: typeof body.root === 'string' ? body.root : '',
          name: typeof body.name === 'string' ? body.name : undefined,
          documentationDir: typeof body.documentationDir === 'string' ? body.documentationDir : '.',
          tokensDir: typeof body.tokensDir === 'string' ? body.tokensDir : null,
          linkTokens: body.linkTokens === true,
        },
        pack.version,
      );
      return c.json(result, 201);
    } catch (e) {
      return fail((e as Error).message, /already/.test((e as Error).message) ? 409 : 400);
    }
  });

  // Stop listing a linked folder. Its files and saved versions are left alone.
  app.delete('/api/projects/:slug/link', (c) =>
    workspace.unlink(c.req.param('slug'))
      ? c.json({ unlinked: true })
      : fail('That project is not a linked folder', 404),
  );

  app.post('/api/projects', async (c) => {
    const { name, platforms } = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      platforms?: unknown;
    };
    const pack = listPacks()[0];
    if (!name?.trim()) return fail('Name is required');
    if (!pack) return fail('No schema pack installed. Run: npm run pack:add -- v0.23.1');
    try {
      const declared = Array.isArray(platforms)
        ? platforms.filter((p): p is string => typeof p === 'string')
        : [];
      return c.json(workspace.create(name, pack.version, declared), 201);
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
      title: project.title(),
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
    const names = new Map(project.entries().map((e) => [e.id, e.name]));
    const out: RefTarget[] = [];
    for (const [id, entry] of Object.entries(resolvedView(project, match.pack.version).entries)) {
      out.push({ target: id, label: names.get(id) ?? id, type: 'entry' });
      for (const item of entry.items) {
        if (!item.address) continue;
        out.push({
          target: `${id}#${item.address}`,
          label: item.address,
          type: item.type,
          ...(item.sectionKind ? { sectionKind: item.sectionKind } : {}),
        });
      }
    }
    return c.json(out);
  });

  // What the resolver works out beyond what is written: effective content of reusing items, what
  // points at each entry, successors.
  app.get('/api/projects/:slug/resolved', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    const project = Project.load({ dir });
    const match = project.pack();
    return c.json(match ? resolvedView(project, match.pack.version) : { entries: {} });
  });

  app.get('/api/projects/:slug/file', (c) => {
    const abs = workspace.documentPath(c.req.param('slug'), c.req.query('path') ?? '');
    if (!abs) return fail('Invalid path', 400);
    try {
      const raw = readFileSync(abs, 'utf8');
      remember(c.req.param('slug'), c.req.query('path') ?? '', raw);
      const doc = DsdsDocument.parse(raw, undefined);
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
    const dir = workspace.dirOf(slug) as string;
    let text: string;
    try {
      text = applyOpsToFile(dir, abs, ops);
    } catch (e) {
      return fail((e as Error).message, e instanceof FileNotFound ? 404 : 400);
    }
    remember(slug, path, text);
    const project = Project.load({ dir });
    const match = project.pack();
    const validation = match ? project.validate(match.pack.version).get(path) : undefined;
    return c.json({
      value: DsdsDocument.parse(text).toValue(),
      text,
      validation: validation ?? null,
    });
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
    const before = seen.get(seenKey(slug, path));
    if (before && existsSync(abs) && digest(readFileSync(abs, 'utf8')) !== before) {
      return fail(
        'The file changed on disk since it was opened here (for example by a git pull). Nothing was overwritten: reload to see the current file.',
        409,
      );
    }
    try {
      // The path was checked to be inside the project, so its folders may be created: a new file
      // can go in a subfolder that is not there yet.
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    } catch (e) {
      return fail(`Could not save the file: ${(e as Error).message}`);
    }
    remember(slug, path, text);
    const project = Project.load({ dir: workspace.dirOf(slug) as string });
    const match = project.pack();
    const validation = match ? project.validate(match.pack.version).get(path) : undefined;
    return c.json({ value: doc.toValue(), text, validation: validation ?? null });
  });

  // Remove a whole document file (a standalone entry). Moved to .dsds-trash/, not deleted.
  app.delete('/api/projects/:slug/file', (c) => {
    try {
      const trashed = workspace.trash(c.req.param('slug'), c.req.query('path') ?? '');
      forget(c.req.param('slug'));
      return c.json({ trashed });
    } catch (e) {
      return fail((e as Error).message, /not found/i.test((e as Error).message) ? 404 : 400);
    }
  });

  // The draft: files that differ from the last saved version.
  app.get('/api/projects/:slug/draft', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    return c.json({ ...draftOf(dir), suggestedTag: suggestedTag(dir) });
  });

  // The history: versions newest first (quicksaves included; the client folds them away).
  app.get('/api/projects/:slug/versions', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    return c.json(listVersions(dir));
  });

  // What changed between two revisions, entry by entry. `from`: a version id or `HEAD` (the latest
  // version); `to`: a version id or `working` (the files as they are now, which is the default).
  app.get('/api/projects/:slug/diff', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    const from = c.req.query('from') === 'HEAD' ? headVersion(dir) : (c.req.query('from') ?? '');
    const to = c.req.query('to') ?? 'working';
    if (!from || !isVersion(dir, from)) return fail('Version not found', 404);
    if (to !== 'working' && !isVersion(dir, to)) return fail('Version not found', 404);
    return c.json(diffRevisions(dir, from, to));
  });

  // Tag or name an earlier version.
  for (const action of ['tag', 'name'] as const) {
    app.post(`/api/projects/:slug/versions/:id/${action}`, async (c) => {
      const dir = workspace.dirOf(c.req.param('slug'));
      if (!dir) return fail('Project not found', 404);
      const id = c.req.param('id');
      if (!isVersion(dir, id)) return fail('Version not found', 404);
      const body = (await c.req.json().catch(() => ({}))) as { tag?: unknown; label?: unknown };
      try {
        if (action === 'tag') tagVersion(dir, id, typeof body.tag === 'string' ? body.tag : '');
        else nameVersion(dir, id, typeof body.label === 'string' ? body.label : '');
      } catch (e) {
        return fail((e as Error).message);
      }
      return c.json(listVersions(dir));
    });
  }

  // Restore an earlier version: the files become that version, saved as a new version on top.
  app.post('/api/projects/:slug/versions/:id/restore', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    const id = c.req.param('id');
    if (!isVersion(dir, id)) return fail('Version not found', 404);
    try {
      restoreVersion(dir, id);
      forget(c.req.param('slug'));
    } catch (e) {
      const message = (e as Error).message;
      return fail(message, /unsaved changes|already match/i.test(message) ? 409 : 400);
    }
    return c.json({ ...draftOf(dir), suggestedTag: suggestedTag(dir) });
  });

  // Save the draft as a version: a quicksave (no label) or a named one (label, optional tag).
  app.post('/api/projects/:slug/versions', async (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    const body = (await c.req.json().catch(() => ({}))) as {
      label?: unknown;
      tag?: unknown;
      stamp?: unknown;
    };
    const label = typeof body.label === 'string' ? body.label : undefined;
    const tag = typeof body.tag === 'string' ? body.tag : undefined;
    // Stamping is for a named version only: `metadata.updated` records a deliberate change.
    const stamp = body.stamp === true && !!label?.trim();
    try {
      saveVersion(dir, {
        label,
        tag,
        beforeCommit: stamp
          ? () => {
              stampChanged(dir, label?.trim() ?? '');
              forget(c.req.param('slug'));
            }
          : undefined,
      });
    } catch (e) {
      const message = (e as Error).message;
      return fail(message, /no changes/i.test(message) ? 409 : 400);
    }
    return c.json({ ...draftOf(dir), suggestedTag: suggestedTag(dir) });
  });

  // Go back to the last saved version. What is discarded is first saved as an automatic version.
  app.post('/api/projects/:slug/draft/discard', (c) => {
    const dir = workspace.dirOf(c.req.param('slug'));
    if (!dir) return fail('Project not found', 404);
    if (!hasVersion(dir)) return fail('There is no saved version to go back to yet', 409);
    try {
      const discarded = discardDraft(dir);
      forget(c.req.param('slug'));
      return c.json({ discarded, ...draftOf(dir) });
    } catch (e) {
      return fail((e as Error).message);
    }
  });

  // For tests/tools: which pack a version maps to.
  app.get('/api/pack-for/:version', (c) => {
    const match = packForSchemaVersion(c.req.param('version'));
    return match ? c.json(match) : fail('No pack covers that version', 404);
  });

  return app;
}
