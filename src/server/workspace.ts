import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), '../../workspace');
export const DOCUMENT_FILE = /\.dsds\.(ya?ml|json)$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface ProjectInfo {
  slug: string;
  /** Number of document files in the project. */
  documents: number;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** A folder of projects. Every project is its own git repo. */
export class Workspace {
  constructor(readonly root: string = process.env.DSDS_WORKSPACE ?? DEFAULT_WORKSPACE) {
    mkdirSync(this.root, { recursive: true });
  }

  list(): ProjectInfo[] {
    return readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SLUG.test(d.name))
      .map((d) => ({ slug: d.name, documents: countDocuments(join(this.root, d.name)) }))
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  /** Absolute project directory, or null if the slug is invalid or the project doesn't exist. */
  dirOf(slug: string): string | null {
    if (!SLUG.test(slug)) return null;
    const dir = join(this.root, slug);
    return existsSync(dir) && statSync(dir).isDirectory() ? dir : null;
  }

  /**
   * Create a project: a folder, `git init`, and a starter base document with one system entry.
   * Throws if the name gives no usable slug or the project exists.
   */
  create(name: string, schemaVersion: string): ProjectInfo {
    const slug = slugify(name);
    if (!SLUG.test(slug)) throw new Error('Name must contain letters or digits');
    const dir = join(this.root, slug);
    if (existsSync(dir)) throw new Error(`Project "${slug}" already exists`);
    mkdirSync(dir);
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const title = name.trim();
    writeFileSync(
      join(dir, `${slug}.dsds.yaml`),
      [
        `$schema: https://designsystemdocspec.org/v${schemaVersion}/dsds.bundled.yaml`,
        `schemaVersion: "${schemaVersion}"`,
        `name: ${JSON.stringify(title)}`,
        'entries:',
        '  - kind: system',
        `    id: ${slug}`,
        `    name: ${JSON.stringify(title)}`,
        '    description: Describe what this design system is and who it is for.',
        '',
      ].join('\n'),
    );
    return { slug, documents: 1 };
  }

  /**
   * Remove a document by moving it to `.dsds-trash/` (never unlinking it). Refuses to remove the
   * project's only document. Returns the trash path, relative to the project.
   */
  trash(slug: string, path: string): string {
    const abs = this.documentPath(slug, path);
    const dir = this.dirOf(slug);
    if (!abs || !dir || !existsSync(abs)) throw new Error('File not found');
    if (countDocuments(dir) <= 1) throw new Error('Cannot remove the only document in a project');
    const trashDir = join(dir, '.dsds-trash');
    mkdirSync(trashDir, { recursive: true });
    const name = `${Date.now()}-${path.replace(/[\\/]/g, '__')}`;
    renameSync(abs, join(trashDir, name));
    return `.dsds-trash/${name}`;
  }

  /**
   * Resolve a project-relative document path to an absolute one. Refuses anything outside the
   * project folder and anything that isn't a DSDS document file.
   */
  documentPath(slug: string, path: string): string | null {
    const dir = this.dirOf(slug);
    if (!dir || !DOCUMENT_FILE.test(path)) return null;
    const abs = resolve(dir, path);
    const rel = relative(dir, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
    return abs;
  }
}

function countDocuments(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.dsds-trash') continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) n += countDocuments(abs);
    else if (DOCUMENT_FILE.test(name)) n++;
  }
  return n;
}
