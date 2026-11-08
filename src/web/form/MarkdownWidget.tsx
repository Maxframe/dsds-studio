import { useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { linkAt, suggestTargets } from '@shared/dsds-links';
import { Command, CommandItem, CommandList } from '@web/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@web/components/ui/popover';
import { Textarea } from '@web/components/ui/textarea';
import { useForm } from './context';
import { useDraft, type Common } from './widgets';

/**
 * A Markdown textarea. Typing `<dsds:` or `](dsds:` opens a list of the project's entries and
 * addresses to link to. Like the other text widgets it commits on blur.
 */
export function MarkdownWidget({ pointer, value, onCommit, required }: Common) {
  const { targets } = useForm();
  const current = typeof value === 'string' ? value : '';
  const { text: draft, set: setDraft } = useDraft(current);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);

  const link = linkAt(draft, caret);
  const options = link && dismissed !== link.from ? suggestTargets(targets, link.query) : [];
  const open = options.length > 0;
  const index = Math.min(active, options.length - 1);

  const commit = () => {
    if (draft === current) return;
    onCommit(draft === '' && !required ? undefined : draft);
  };

  const insert = (target: string, el: HTMLTextAreaElement) => {
    if (!link) return;
    const next = draft.slice(0, link.from) + target + draft.slice(caret);
    const end = link.from + target.length;
    setDraft(next);
    setCaret(end);
    setDismissed(link.from); // the link is complete: keep the list closed until the next edit
    // The new text is rendered on the next frame; put the cursor after the inserted target.
    requestAnimationFrame(() => el.setSelectionRange(end, end));
  };

  const track = (e: SyntheticEvent<HTMLTextAreaElement>) =>
    setCaret(e.currentTarget.selectionStart);

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    setCaret(e.target.selectionStart);
    setActive(0);
    setDismissed(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const chosen = options[index];
      if (chosen) insert(chosen.target, e.currentTarget);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (link) setDismissed(link.from);
    }
  };

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <Textarea
          id={pointer}
          value={draft}
          rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
          onChange={onChange}
          onSelect={track}
          onKeyDown={onKeyDown}
          onBlur={commit}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        // The textarea keeps the focus (and drives the list); the popover only displays it.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Filtering and ranking are ours (suggestTargets); the textarea picks the active row. */}
        <Command
          shouldFilter={false}
          value={options[index]?.target ?? ''}
          onValueChange={(target) => {
            const i = options.findIndex((o) => o.target === target);
            if (i >= 0) setActive(i);
          }}
        >
          <CommandList label="Link targets" className="p-1">
            {options.map((o) => (
              <CommandItem
                key={o.target}
                value={o.target}
                className="justify-between"
                // mousedown, not click: the textarea must not lose focus (and commit) first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  const el = document.getElementById(pointer);
                  if (el instanceof HTMLTextAreaElement) insert(o.target, el);
                }}
              >
                <span className="truncate">{o.target}</span>
                <span className="truncate text-muted-foreground">{o.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
