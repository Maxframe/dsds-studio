import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/components/ui/collapsible';
import type { IdNode } from '@shared/idTree';
import type { EntrySummary } from '@shared/types';

/**
 * The nodes of an id tree: a collapsible group for entries that share an id prefix, and the
 * caller's own row for an entry. A group says how many entries it holds and sums their findings, so
 * a collapsed group still shows that something inside it needs attention.
 */
export function IdNodes(props: {
  nodes: IdNode<EntrySummary>[];
  /** A group is open when its key is in here, or when `forceOpen` is set (a filter is active). */
  open: ReadonlySet<string>;
  forceOpen: boolean;
  onToggle(key: string, open: boolean): void;
  findings(entries: EntrySummary[]): { errors: number; warnings: number };
  renderEntry(entry: EntrySummary): ReactNode;
}) {
  return (
    <>
      {props.nodes.map((n) => {
        if (n.type === 'entry') return props.renderEntry(n.item);
        const open = props.forceOpen || props.open.has(n.key);
        const f = props.findings(n.items);
        return (
          <Collapsible
            key={n.key}
            open={open}
            onOpenChange={(o) => props.onToggle(n.key, o)}
            className="tree-subgroup"
          >
            <div className="tree-row">
              <CollapsibleTrigger
                className="tree-button tree-folder group flex min-h-(--control-height) w-full min-w-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2 text-inherit outline-none hover:bg-transparent focus-visible:ring-3 focus-visible:ring-ring/50"
                title={n.key.replace(/[./]$/, '')}
              >
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none"
                />
                <span className="truncate">{n.label}</span>
                <span className="badge ml-auto">{n.items.length}</span>
                {f.errors ? <span className="badge badge--error">{f.errors}</span> : null}
                {!f.errors && f.warnings ? (
                  <span className="badge badge--warning">{f.warnings}</span>
                ) : null}
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="tree-rows tree-nest">
                <IdNodes {...props} nodes={n.children} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </>
  );
}
