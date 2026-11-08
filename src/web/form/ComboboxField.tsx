import { useState } from 'react';
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@web/components/ui/combobox';
import type { Common } from './widgets';

export interface ComboOption {
  value: string;
  /** Muted text after the value: a label, or how often it is used. */
  hint?: string;
  /** Extra words the search also matches. */
  keywords?: string[];
}

export interface ComboGroup {
  /** Shown above the options. Leave out for a single unlabelled list. */
  heading?: string;
  options: ComboOption[];
}

/** One list row. `create` marks the extra "Use ..." row for text that is not an option. */
interface Row extends ComboOption {
  create?: boolean;
}
interface Section {
  value: string;
  items: Row[];
}

const matches = (o: ComboOption, query: string) =>
  query === '' ||
  o.value.toLowerCase().includes(query) ||
  (o.keywords ?? []).some((k) => k.toLowerCase().includes(query));

/**
 * A text field that offers known values but accepts any other text: type to filter the grouped
 * options, pick one, or choose "Use ..." for text that is not listed. Built on shadcn's Combobox,
 * which only selects from its list, so the typed text is offered as one more row. Commits when a
 * row is chosen; leaving the field without choosing keeps the saved value.
 */
export function ComboboxField({
  pointer,
  value,
  onCommit,
  required,
  groups,
  placeholder,
}: Common & { groups: ComboGroup[]; placeholder: string }) {
  const current = typeof value === 'string' ? value : '';
  // The text being typed, or null while the field just shows the saved value (so opening the list
  // starts unfiltered instead of filtering by the current value).
  const [draft, setDraft] = useState<string | null>(null);
  const query = (draft ?? '').trim();
  const q = query.toLowerCase();

  const known = groups.some((g) => g.options.some((o) => o.value === query));
  const sections: Section[] = groups
    .map((g) => ({ value: g.heading ?? '', items: g.options.filter((o) => matches(o, q)) }))
    .filter((s) => s.items.length > 0);
  if (query && !known) sections.push({ value: '', items: [{ value: query, create: true }] });

  const choose = (next: string) => {
    setDraft(null);
    if (next !== current) onCommit(next === '' && !required ? undefined : next);
  };

  return (
    <Combobox<Row>
      items={sections}
      value={current ? { value: current } : null}
      onValueChange={(row, details) => {
        // Only a chosen row (click or Enter) or the clear button commits. Emptying the text also
        // reports "no selection", and must not wipe the saved value.
        if (details.reason === 'item-press' || details.reason === 'clear-press')
          choose(row?.value ?? '');
      }}
      inputValue={draft ?? current}
      onInputValueChange={(text, details) => {
        // Typing, or emptying the field, is editing; selecting a row or closing is not.
        if (details.reason === 'input-change' || details.reason === 'input-clear') setDraft(text);
      }}
      onOpenChange={(open) => {
        if (!open) setDraft(null);
      }}
      filter={null}
      itemToStringLabel={(row) => row.value}
      isItemEqualToValue={(a, b) => a.value === b.value}
      autoHighlight={query !== ''}
      openOnInputClick
    >
      <ComboboxInput
        id={pointer}
        placeholder={placeholder}
        // Select the saved text so typing replaces it instead of extending it.
        onFocus={(e) => e.currentTarget.select()}
        // Leaving the field without choosing a row drops what was typed.
        onBlur={() => setDraft(null)}
        showClear={!required && current !== ''}
      />
      <ComboboxContent>
        <ComboboxEmpty>No match</ComboboxEmpty>
        <ComboboxList>
          {(section: Section) => (
            <ComboboxGroup key={section.value || 'rows'} items={section.items}>
              {section.value ? <ComboboxLabel>{section.value}</ComboboxLabel> : null}
              <ComboboxCollection>
                {(row: Row) => (
                  <ComboboxItem key={row.value} value={row}>
                    {row.create ? (
                      <span className="truncate">Use “{row.value}”</span>
                    ) : (
                      <>
                        <span className="truncate">{row.value}</span>
                        {row.hint ? (
                          <span className="ml-auto truncate text-muted-foreground">{row.hint}</span>
                        ) : null}
                      </>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
