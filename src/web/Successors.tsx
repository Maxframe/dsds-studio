import type { EntrySummary, Succession } from '@shared/types';
import { Button } from '@web/components/ui/button';

/** A target `entry` or `entry#address`, by the entry's name. */
function nameOf(target: string, entries: EntrySummary[]): { entry?: EntrySummary; label: string } {
  const [id = '', address] = target.split('#');
  const entry = entries.find((e) => e.id === id);
  const name = entry?.name ?? id;
  return { entry, label: address ? `${name} › ${address}` : name };
}

/**
 * Where a deprecated entry went (Processing §7). The entries it names as replacements, then where
 * following on through replacements that are deprecated too ends. With several successors the app
 * does not choose: the deprecation notice says which to use when.
 */
export function Successors(props: {
  succession: Succession;
  entries: EntrySummary[];
  /** Open a replacement (`entry` or `entry#address`). */
  onOpen(target: string): void;
}) {
  const { succession } = props;
  const direct = succession.replacedBy;
  // The end of the chain, when it is not simply what the entry names itself.
  const further = succession.successors.filter((s) => !direct.includes(s));
  const list = (targets: string[]) => (
    <ul>
      {targets.map((t) => (
        <li key={t}>
          <Button
            variant="ghost"
            className="h-auto w-full min-w-0 justify-start px-2 py-1 text-left font-normal whitespace-normal"
            onClick={() => props.onOpen(t)}
          >
            {nameOf(t, props.entries).label}
          </Button>
        </li>
      ))}
    </ul>
  );
  return (
    <section className="successors" aria-label="Replaced by">
      <h2 className="pane-title">Replaced by</h2>
      {list(direct)}
      {further.length > 0 ? (
        <>
          <p className="field-note">
            {direct.length === 1 ? 'That one is' : 'These are'} replaced as well. Following on ends
            at:
          </p>
          {list(further)}
        </>
      ) : null}
      {succession.choose ? (
        <p className="field-note">
          There is more than one successor. The deprecation notice says which to use when; Studio
          does not choose for you.
        </p>
      ) : null}
    </section>
  );
}
