import type { ResolvedProject } from '@shared/types';
import { loadPackRuntime } from '../validator/pack-runtime';
import type { Project } from './project';

/**
 * What the pack's resolver works out for a project (processing model §2, §4, §5, §7), by entry id:
 * every item's address and effective content, what points at each entry, and each deprecated
 * entry's successors. The resolver is the pack's own; this adds only the kind of section each item
 * sits in, read from the pack's address book, so a picker can offer items of the right kind.
 */
export function resolvedView(project: Project, packVersion: string): ResolvedProject {
  const runtime = loadPackRuntime(packVersion);
  const values = project.documents.map((d) => d.doc.toValue());
  const entities = new Map<string, unknown>();
  for (const value of values) {
    for (const entity of runtime.entriesIn(value)) {
      const id = (entity as { id?: unknown })?.id;
      if (typeof id === 'string' && !entities.has(id)) entities.set(id, entity);
    }
  }
  const out: ResolvedProject = { entries: {} };
  for (const entry of runtime.resolveProject(values).entries) {
    const kindOf = new Map<string, string>();
    for (const candidates of runtime.itemAddresses(entities.get(entry.id)).values()) {
      for (const c of candidates) if (c.sectionKind) kindOf.set(c.pointer, c.sectionKind);
    }
    out.entries[entry.id] = {
      kind: entry.kind,
      items: entry.items.map((i) => ({ ...i, sectionKind: kindOf.get(i.pointer) })),
      ...(entry.incoming ? { incoming: entry.incoming } : {}),
      ...(entry.succession ? { succession: entry.succession } : {}),
    };
  }
  return out;
}
