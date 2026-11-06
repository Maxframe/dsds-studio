import { useId, useState, type ChangeEvent, type KeyboardEvent, type SyntheticEvent } from 'react';
import { linkAt, suggestTargets } from '@shared/dsds-links';
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
  const listId = useId();

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
    <div className="suggest">
      <textarea
        id={pointer}
        className="input"
        value={draft}
        rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
        onChange={onChange}
        onSelect={track}
        onKeyDown={onKeyDown}
        onBlur={commit}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
      />
      {open ? (
        <ul className="suggest-list" id={listId} role="listbox" aria-label="Link targets">
          {options.map((o, i) => (
            <li
              key={o.target}
              role="option"
              aria-selected={i === index}
              className={`suggest-option ${i === index ? 'suggest-option--active' : ''}`}
              // mousedown, not click: the textarea must not lose focus (and commit) first.
              onMouseDown={(e) => {
                e.preventDefault();
                const el = document.getElementById(pointer);
                if (el instanceof HTMLTextAreaElement) insert(o.target, el);
              }}
            >
              <span>{o.target}</span>
              <span className="suggest-label">{o.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
