import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PackInfo } from '@shared/types';

export const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../packs');

/** Every installed schema pack, newest version first. */
export function listPacks(dir = PACKS_DIR): PackInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'pack.json')))
    .map((d) => JSON.parse(readFileSync(join(dir, d.name, 'pack.json'), 'utf8')) as PackInfo)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
}

export interface PackMatch {
  pack: PackInfo;
  /** True when the pack's version equals the document's `schemaVersion`. */
  exact: boolean;
}

/**
 * Pick the pack for a document's `schemaVersion`. Pre-1.0, a patch release only adds optional
 * things (upstream stability policy), so any pack with the same major.minor will do; the newest
 * wins. Returns null when no pack covers that minor version: the document needs a schema upgrade
 * or a `pack:add`.
 */
export function packForSchemaVersion(
  schemaVersion: string | null,
  packs: PackInfo[] = listPacks(),
): PackMatch | null {
  if (!schemaVersion) return null;
  const minor = (v: string) => v.split('.').slice(0, 2).join('.');
  const candidates = packs.filter((p) => minor(p.version) === minor(schemaVersion));
  const pack = candidates[0]; // listPacks() is newest first
  return pack ? { pack, exact: pack.version === schemaVersion } : null;
}
