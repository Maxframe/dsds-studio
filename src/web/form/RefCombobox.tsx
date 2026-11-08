import type { RefTarget } from '@shared/types';
import { ComboboxField } from './ComboboxField';
import type { Common } from './widgets';

/**
 * Picks a ref target (`entryId` or `entryId#address`) from the project, or accepts any typed text,
 * since a ref may point at something outside the project.
 */
export function RefCombobox({ targets, ...common }: Common & { targets: RefTarget[] }) {
  return (
    <ComboboxField
      {...common}
      placeholder="Select a target"
      groups={[
        {
          options: targets.map((t) => ({
            value: t.target,
            hint: t.label,
            keywords: [t.label],
          })),
        },
      ]}
    />
  );
}
