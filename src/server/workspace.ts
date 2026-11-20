import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePlatforms } from '@shared/platforms';
import type { LinkRequest, LinkResult, ProjectInfo } from '@shared/types';
import { insideRoot, LinkStore } from './links';
import { Project } from './projects/project';
import { dataRoot } from './projects/snapshots';
import { createInitialVersion } from './projects/versions';

export const DEFAULT_WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), '../../workspace');
export const DOCUMENT_FILE = /\.dsds\.(ya?ml|json)$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** A folder of projects. Their versions are snapshots kept in the data folder (ADR 0006). */
export class Workspace {
  /** Folders opened from elsewhere on disk (M3c). */
  readonly links: LinkStore;

  constructor(
    readonly root: string = process.env.DSDS_WORKSPACE ?? DEFAULT_WORKSPACE,
    links?: LinkStore,
  ) {
    mkdirSync(this.root, { recursive: true });
    this.links = links ?? LinkStore.forWorkspace(this.root);
  }

  list(): ProjectInfo[] {
    const own: ProjectInfo[] = readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SLUG.test(d.name))
      .map((d) => {
        const dir = join(this.root, d.name);
        return { slug: d.name, title: titleOf(dir), documents: countDocuments(dir) };
      });
    const linked: ProjectInfo[] = this.links.list().map((l) => {
      const dir = join(l.root, l.documentationDir);
      return {
        slug: l.slug,
        title: isDirectory(dir) ? titleOf(dir) : null,
        documents: isDirectory(dir) ? countDocuments(dir) : 0,
        linked: l,
      };
    });
    return [...own, ...linked].sort((a, b) => a.slug.localeCompare(b.slug));
  }

  /**
   * Absolute project directory, or null if the slug is invalid or the project doesn't exist. For a
   * linked folder this is its documentation folder: documents are read and versions kept for that folder only.
   */
  dirOf(slug: string): string | null {
    if (!SLUG.test(slug)) return null;
    const dir = join(this.root, slug);
    if (isDirectory(dir)) return dir;
    const link = this.links.get(slug);
    const documentation = link ? join(link.root, link.documentationDir) : null;
    return documentation && isDirectory(documentation) ? documentation : null;
  }

  /** A slug no workspace project or linked folder uses yet. */
  private freeSlug(wanted: string): string {
    const taken = (s: string) => existsSync(join(this.root, s)) || this.links.get(s) !== null;
    if (!taken(wanted)) return wanted;
    for (let n = 2; ; n++) {
      const slug = `${wanted.slice(0, 60)}-${n}`;
      if (!taken(slug)) return slug;
    }
  }

  /**
   * Open a folder from anywhere on disk (M3c). Documents live in its documentation folder, which is created
   * with a starter document when it has none. The tokens are never copied: with `linkTokens` a
   * symbolic link `tokens/` inside the documentation folder points at them, so a relative `source` path is
   * inside the project and the validator can check it. Nothing else in the folder is touched.
   */
  link(req: LinkRequest, schemaVersion: string): LinkResult {
    const warnings: string[] = [];
    if (typeof req.root !== 'string' || !isAbsolute(req.root) || !isDirectory(req.root))
      throw new Error('The folder to open does not exist');
    const root = resolve(req.root);
    if (isInside(this.root, root) || isInside(dataRoot(), root) || root === this.root)
      throw new Error('That folder belongs to Studio itself');
    const documentation = insideRoot(root, req.documentationDir || '.');
    if (documentation === null)
      throw new Error('The documentation folder must be inside the opened folder');
    let tokens: string | null = null;
    if (req.tokensDir) {
      tokens = insideRoot(root, req.tokensDir);
      if (tokens === null) throw new Error('The token folder must be inside the opened folder');
      if (!isDirectory(join(root, tokens))) throw new Error('The token folder does not exist');
    }
    const documentationAbs = join(root, documentation);
    const existing = this.links
      .list()
      .find((l) => l.root === root && l.documentationDir === documentation);
    if (existing) throw new Error(`This folder is already open as "${existing.slug}"`);
    if (existsSync(documentationAbs) && !isDirectory(documentationAbs))
      throw new Error('The documentation folder is a file, not a folder');

    const title = req.name?.trim() ?? '';
    if (!title) throw new Error('Give the project a name');
    const slug = this.freeSlug(slugify(title) || 'project');
    mkdirSync(documentationAbs, { recursive: true });
    if (countDocuments(documentationAbs) === 0) {
      writeFileSync(
        join(documentationAbs, `${slug}.dsds.yaml`),
        starterDocument(slug, title, schemaVersion, []),
      );
    }

    if (tokens !== null && req.linkTokens) {
      const tokensAbs = join(root, tokens);
      const linkPath = join(documentationAbs, 'tokens');
      const target = relative(documentationAbs, tokensAbs) || '.';
      if (isInside(documentationAbs, tokensAbs) || tokensAbs === documentationAbs) {
        warnings.push(
          'The tokens are inside the documentation folder already; no link was needed.',
        );
      } else if (isInside(tokensAbs, documentationAbs)) {
        warnings.push(
          'The documentation folder is inside the token folder, so a link would loop. Source paths outside the documentation folder are not checked by DSDS-11.',
        );
      } else if (lexists(linkPath)) {
        warnings.push(
          `"${relative(root, linkPath) || 'tokens'}" exists already, so no link to the tokens was made.`,
        );
      } else {
        symlinkSync(target, linkPath, 'dir');
      }
    }

    this.links.add({ slug, name: title, root, documentationDir: documentation, tokensDir: tokens });
    createInitialVersion(documentationAbs);
    const link = this.links.get(slug);
    return {
      project: {
        slug,
        title: titleOf(documentationAbs),
        documents: countDocuments(documentationAbs),
        ...(link ? { linked: link } : {}),
      },
      warnings,
    };
  }

  /** Forget a linked folder. Its files and its saved versions stay where they are. */
  unlink(slug: string): boolean {
    return this.links.remove(slug);
  }

  /**
   * Create a project: a folder, and a starter base document with one system entry. The
   * platforms the system ships on, if given, are declared on that entry (`metadata.platforms`).
   * Throws if the name gives no usable slug or the project exists.
   */
  create(name: string, schemaVersion: string, platforms: readonly string[] = []): ProjectInfo {
    const slug = slugify(name);
    if (!SLUG.test(slug)) throw new Error('Name must contain letters or digits');
    const dir = join(this.root, slug);
    if (existsSync(dir)) throw new Error(`Project "${slug}" already exists`);
    mkdirSync(dir);
    writeFileSync(
      join(dir, `${slug}.dsds.yaml`),
      starterDocument(slug, name.trim(), schemaVersion, normalizePlatforms(platforms)),
    );
    createInitialVersion(dir);
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

/** The design system's name, read from its documents. Null if they cannot be read or have none. */
function titleOf(dir: string): string | null {
  try {
    return Project.load({ dir }).title();
  } catch {
    return null;
  }
}

/** The base document a new project starts with: one system entry. */
function starterDocument(
  slug: string,
  title: string,
  schemaVersion: string,
  platforms: readonly string[],
): string {
  return [
    `$schema: https://designsystemdocspec.org/v${schemaVersion}/dsds.bundled.yaml`,
    `schemaVersion: "${schemaVersion}"`,
    `name: ${JSON.stringify(title)}`,
    'entries:',
    '  - kind: system',
    `    id: ${slug}`,
    `    name: ${JSON.stringify(title)}`,
    '    description: Describe what this design system is and who it is for.',
    ...(platforms.length > 0
      ? ['    metadata:', `      platforms: [${platforms.join(', ')}]`]
      : []),
    '',
  ].join('\n');
}

const isDirectory = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** True for anything at the path, including a broken symbolic link. */
const lexists = (p: string): boolean => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Documents below a folder. Symbolic links are not followed (a linked token folder is not ours). */
function countDocuments(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.dsds-trash') continue;
    const abs = join(dir, name);
    const stat = lstatSync(abs);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) n += countDocuments(abs);
    else if (DOCUMENT_FILE.test(name)) n++;
  }
  return n;
}
