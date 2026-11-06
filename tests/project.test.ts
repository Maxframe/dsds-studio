import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Project } from '@server/projects/project';
import { packForSchemaVersion } from '@server/packs';
import { latest, packDir } from './helpers';

const version = latest?.version ?? '';
const vectors = join(packDir(), 'examples/vectors');

// Upstream's contract: everything must match except each problem's `message`.
const comparable = (r: { problems: Array<{ code: string; at: string }> }) => ({
  ...r,
  problems: r.problems.map(({ code, at }) => ({ code, at })),
});

describe('project resolution matches upstream consumer test vectors', () => {
  for (const name of readdirSync(vectors)) {
    it(name, () => {
      // Each vector folder is one project: every .yaml file, read in name order.
      const project = Project.load({ dir: join(vectors, name), include: /\.ya?ml$/ });
      const expected = JSON.parse(readFileSync(join(vectors, name, 'expected.json'), 'utf8'));
      expect(comparable(project.resolve(version))).toEqual(comparable(expected));
    });
  }
});

describe('Project', () => {
  it('follows rel: file refs from a root document', () => {
    const project = Project.load({
      dir: join(vectors, 'cross-file'),
      rootFile: 'index.yaml',
    });
    expect(project.documents.map((d) => d.path).sort()).toEqual(['button.yaml', 'index.yaml']);
    expect(project.problems).toEqual([]);
  });

  it('indexes entries and shared entries with their location', () => {
    const project = Project.load({ dir: join(vectors, 'cross-file'), include: /\.ya?ml$/ });
    const ids = project.entries().map((e) => e.id);
    expect(ids).toContain('button');
    expect(ids).toContain('shared-a11y');
    expect(project.entries().every((e) => e.file.endsWith('.yaml'))).toBe(true);
  });

  it('does not follow a rel: file ref out of the project folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsds-proj-'));
    mkdirSync(join(root, 'proj'));
    writeFileSync(
      join(root, 'outside.dsds.yaml'),
      'kind: entry\nid: outside\nname: O\ndescription: x\n',
    );
    writeFileSync(
      join(root, 'proj', 'index.dsds.yaml'),
      'schemaVersion: "0.23.1"\nname: P\nentries:\n  - kind: entry\n    id: a\n    name: A\n    description: x\nrefs:\n  - href: ../outside.dsds.yaml\n    rel: file\n',
    );
    const project = Project.load({ dir: join(root, 'proj'), rootFile: 'index.dsds.yaml' });
    expect(project.documents.map((d) => d.path)).toEqual(['index.dsds.yaml']);
    expect(project.problems.some((p) => /outside/.test(p.message))).toBe(true);
  });

  it('validates every document against the project', () => {
    const project = Project.load({ dir: join(vectors, 'cross-file'), include: /\.ya?ml$/ });
    const results = project.validate(version);
    expect([...results.keys()].sort()).toEqual(['button.yaml', 'index.yaml']);
  });
});

describe('packForSchemaVersion', () => {
  const packs = [
    { version: '0.23.1', tag: 'v0.23.1', commit: '', addedAt: '' },
    { version: '0.22.0', tag: 'v0.22.0', commit: '', addedAt: '' },
  ];
  it('matches an exact version', () => {
    expect(packForSchemaVersion('0.22.0', packs)).toMatchObject({ exact: true });
  });
  it('lets a patch version use the same minor pack', () => {
    expect(packForSchemaVersion('0.23.0', packs)?.pack.version).toBe('0.23.1');
  });
  it('returns null when no pack covers the minor version', () => {
    expect(packForSchemaVersion('0.21.2', packs)).toBeNull();
    expect(packForSchemaVersion(null, packs)).toBeNull();
  });
});
