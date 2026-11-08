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
  ...common
}: Common & { standard: string[]; usage: Map<string, number> }) {
  const used = (v: string): ComboOption => {
    const n = usage.get(v) ?? 0;
    return { value: v, hint: n > 0 ? `${n} in use` : undefined };
  };
  const custom = [...usage.keys()].filter((v) => !standard.includes(v)).sort();
  return (
    <ComboboxField
      {...common}
      placeholder="Select or type a value"
      groups={[
        { heading: 'Standard', options: standard.map(used) },
        { heading: 'Custom, in use', options: custom.map(used) },
      ]}
    />
  );
}
