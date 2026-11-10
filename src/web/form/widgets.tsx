import { useId, useState } from 'react';
import { parse, stringify } from 'yaml';
import { Input } from '@web/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { Textarea } from '@web/components/ui/textarea';
import { useForm } from './context';
import { RefCombobox } from './RefCombobox';

/**
 * A local draft of an input that resets when the saved value changes underneath it (after a
 * save or a reload), without an effect: the draft remembers which saved value it was based on.
 */
export function useDraft(saved: string) {
  const [state, setState] = useState({ seen: saved, text: saved, error: null as string | null });
  // Whenever the saved value changes, the draft starts over from it. Comparing with the last value
  // seen (not with the value the draft was typed over) also catches a return to an earlier value,
  // such as discarding changes or undoing in the YAML view.
  if (state.seen !== saved) setState({ seen: saved, text: saved, error: null });
  return {
    text: state.seen === saved ? state.text : saved,
    error: state.seen === saved ? state.error : null,
    set: (text: string, error: string | null = null) => setState({ seen: saved, text, error }),
  };
}

export interface Common {
  pointer: string;
  value: unknown;
  /** Called with the new value, or `undefined` to remove an optional field. */
  onCommit(value: unknown): void;
  required?: boolean;
}

/** Text input / textarea. Commits on blur. */
export function TextWidget({
  pointer,
  value,
  onCommit,
  required,
  multiline,
  suggestions,
  placeholder,
}: Common & { multiline?: boolean; suggestions?: string[]; placeholder?: string }) {
  const current = typeof value === 'string' ? value : '';
  const { text: draft, set: setDraft } = useDraft(current);
  const listId = useId();
  const commit = () => {
    if (draft === current) return;
    onCommit(draft === '' && !required ? undefined : draft);
  };
  const common = {
    id: pointer,
    value: draft,
    placeholder,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <Textarea {...common} rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))} />
  ) : (
    <>
      <Input
        {...common}
        type="text"
        list={suggestions?.length ? listId : undefined}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

export function NumberWidget({ pointer, value, onCommit }: Common) {
  return (
    <Input
      id={pointer}
      type="number"
      defaultValue={typeof value === 'number' ? value : ''}
      onBlur={(e) => onCommit(e.target.value === '' ? undefined : Number(e.target.value))}
    />
  );
}

/** Radix Select forbids an empty item value, so "(not set)" gets a sentinel. */
const UNSET = '\u0000unset';

export function SelectWidget({
  pointer,
  value,
  onCommit,
  options,
  required,
}: Common & { options: unknown[] }) {
  return (
    <Select
      value={value === undefined ? UNSET : String(value)}
      onValueChange={(v) => onCommit(v === UNSET ? undefined : v)}
    >
      <SelectTrigger id={pointer} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!required || value === undefined ? <SelectItem value={UNSET}>(not set)</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={String(o)} value={String(o)}>
            {String(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function BooleanWidget({ pointer, value, onCommit }: Common) {
  return (
    <input
      id={pointer}
      type="checkbox"
      checked={value === true}
      onChange={(e) => onCommit(e.target.checked)}
    />
  );
}

/** A `to` pointer: pick the project's entries and item addresses, or type another target. */
export function RefTargetWidget(props: Common) {
  const { targets } = useForm();
  const value = typeof props.value === 'string' ? props.value : '';
  const known = value === '' || targets.some((t) => t.target === value);
  return (
    <>
      <RefCombobox {...props} targets={targets} />
      {!known ? (
        <div className="field-note field-note--warning">Not found in this project.</div>
      ) : null}
    </>
  );
}

/**
 * The fallback for anything the schema renderer can't (or shouldn't) turn into a form: edit the
 * subtree as YAML. Replacing a subtree drops comments inside it, nothing else.
 */
export function RawYamlWidget({ pointer, value, onCommit }: Common) {
  const text = value === undefined ? '' : stringify(value, { lineWidth: 0 }).trimEnd();
  const { text: draft, error, set } = useDraft(text);
  const setDraft = (t: string) => set(t);
  const commit = () => {
    if (draft === text) return;
    try {
      const doc = draft.trim() === '' ? undefined : parse(draft);
      onCommit(doc);
    } catch (e) {
      set(draft, (e as Error).message.split('\n')[0] ?? 'Invalid YAML');
    }
  };
  return (
    <>
      <Textarea
        id={pointer}
        className="bg-muted font-mono text-(length:--text-small)"
        value={draft}
        rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        spellCheck={false}
      />
      {error ? <div className="field-note field-note--error">{error}</div> : null}
    </>
  );
}
