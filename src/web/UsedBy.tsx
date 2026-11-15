import type { EntrySummary, Incoming } from '@shared/types';
import { Button } from '@web/components/ui/button';

/**
 * What points at the open entry, seen from here (Processing §5): a relationship is written once, on
 * its source, and a reader works out the other direction. Each row says which entry (and item) holds
 * the pointer and how, and takes you to the field that holds it.
 */
export function UsedBy(props: {
  incoming: Incoming[];
  entries: EntrySummary[];
  /** Open the entry that holds a pointer, at that pointer (relative to the entry). */
  onGo(entry: EntrySummary, pointer: string): void;
}) {
  const rows = props.incoming.flatMap((i) => {
    const [id = '', address] = i.from.split('#');
    const entry = props.entries.find((e) => e.id === id);
    return entry ? [{ i, entry, address }] : [];
  });
  if (rows.length === 0) return null;
  return (
    <section className="used-by" aria-label="Used by">
      <h2 className="pane-title">Used by · {rows.length}</h2>
      <ul>
        {rows.map(({ i, entry, address }) => (
          <li key={`${i.pointer}|${i.rel}`}>
            <Button
              variant="ghost"
              className="h-auto w-full min-w-0 justify-start gap-2 px-2 py-1 text-left font-normal whitespace-normal"
              onClick={() => props.onGo(entry, i.pointer.slice(entry.id.length))}
            >
              <span className="min-w-0">
                {entry.name ?? entry.id}
                {address ? ` › ${address}` : ''}
              </span>
              <span className="badge">{i.rel}</span>
              {i.at ? <span className="text-muted-foreground">→ #{i.at}</span> : null}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
