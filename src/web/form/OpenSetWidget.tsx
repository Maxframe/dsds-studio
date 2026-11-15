import { kindLabels, normalizeCustom } from '@shared/namespaced';
import { ComboboxField, type ComboOption } from './ComboboxField';
import type { Common } from './widgets';

/**
 * A field whose schema lists standard values but also allows others (an open set, like `kind`).
 * Standard values come from the schema, "In use" are other values the project already holds, and
 * anything else can be typed. Each option says how many other fields use it.
 */
export function OpenSetWidget({
  standard,
  usage,
  namespacePattern,
  namespace,
  ...common
}: Common & {
  standard: string[];
  usage: Map<string, number>;
  /** Set when the schema accepts a namespaced custom value (an entry's `kind`). */
  namespacePattern?: string;
  /** The namespace a new custom value gets. */
  namespace?: string;
}) {
  const used = (v: string): ComboOption => {
    const n = usage.get(v) ?? 0;
    return { value: v, hint: n > 0 ? `${n} in use` : undefined };
  };
  const custom = [...usage.keys()].filter((v) => !standard.includes(v)).sort();
  // With a namespaced custom value allowed, people type a plain name and see a plain name: the
  // namespace the schema requires is added and hidden for them.
  const labels = namespacePattern
    ? kindLabels([...standard, ...custom, typeof common.value === 'string' ? common.value : ''])
    : null;
  return (
    <ComboboxField
      {...common}
      display={labels ? (v) => labels.get(v) ?? v : undefined}
      normalize={
        namespacePattern && namespace
          ? (typed) => normalizeCustom(typed, namespace, namespacePattern)
          : undefined
      }
      placeholder="Select or type a value"
      groups={[
        { heading: 'Standard', options: standard.map(used) },
        { heading: 'Custom, in use', options: custom.map(used) },
      ]}
    />
  );
}
