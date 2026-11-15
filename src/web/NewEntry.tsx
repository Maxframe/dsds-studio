import { useState } from 'react';
import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@web/components/ui/toggle-group';
import { kindLabels, normalizeCustom } from '@shared/namespaced';
import { ComboboxField, type ComboOption } from './form/ComboboxField';

/** A name field that appears under a group title: Enter creates, Escape (or leaving it empty) cancels. */
export function NewEntryInput(props: {
  label: string;
  onCreate(name: string): void;
  onCancel(): void;
  error: string | null;
}) {
  const [name, setName] = useState('');
  return (
    <div className="new-entry">
      <Input
        autoFocus
        value={name}
        placeholder="Name"
        aria-label={props.label}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) props.onCreate(name.trim());
          if (e.key === 'Escape') props.onCancel();
        }}
        onBlur={() => {
          if (!name.trim()) props.onCancel();
        }}
      />
      {props.error ? <div className="field-note field-note--error">{props.error}</div> : null}
    </div>
  );
}

/**
 * The general "Add entry": for a kind that has no group yet (a first theme, a custom kind). The kind
 * is chosen in the same combobox as an entry's `kind` field: standard kinds from the schema, kinds
 * already in the project, or any text.
 */
export function AddEntryPanel(props: {
  standard: string[];
  inUse: Map<string, number>;
  /** What a new custom kind gets in front of its name, and the schema's pattern for it. */
  namespace: string;
  pattern?: string;
  onCreate(kind: string, name: string): void;
  /** A decision (an ADR): a tagged generic entry with its sections ready. */
  onCreateDecision(title: string): void;
  onCancel(): void;
  error: string | null;
}) {
  const [mode, setMode] = useState<'entry' | 'decision'>('entry');
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const used = (v: string): ComboOption => {
    const n = props.inUse.get(v) ?? 0;
    return { value: v, hint: n > 0 ? `${n} in use` : undefined };
  };
  const custom = [...props.inUse.keys()].filter((v) => !props.standard.includes(v)).sort();
  const decision = mode === 'decision';
  // People type a plain name and see plain names; the namespace the schema needs is added for them.
  const labels = kindLabels([...props.standard, ...custom]);
  const ready = (decision || kind !== '') && name.trim() !== '';
  return (
    <form
      className="new-entry grid gap-2"
      aria-label="Add entry"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        if (decision) props.onCreateDecision(name.trim());
        else props.onCreate(kind, name.trim());
      }}
      onKeyDown={(e) => e.key === 'Escape' && props.onCancel()}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="What to add"
        value={mode}
        onValueChange={(v) => v && setMode(v as 'entry' | 'decision')}
      >
        <ToggleGroupItem value="entry">Entry</ToggleGroupItem>
        <ToggleGroupItem value="decision">Decision</ToggleGroupItem>
      </ToggleGroup>
      {decision ? null : (
        <ComboboxField
          pointer="new-entry-kind"
          value={kind}
          required
          onCommit={(v) => setKind(typeof v === 'string' ? v : '')}
          placeholder="Select or type a kind"
          display={(v) => labels.get(v) ?? v}
          normalize={(typed) => normalizeCustom(typed, props.namespace, props.pattern)}
          groups={[
            { heading: 'Standard', options: props.standard.map(used) },
            { heading: 'Custom, in use', options: custom.map(used) },
          ]}
        />
      )}
      <Input
        value={name}
        placeholder={decision ? 'What was decided' : 'Name'}
        aria-label={decision ? 'Decision title' : 'Entry name'}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!ready}>
          Create
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
      {props.error ? <div className="field-note field-note--error">{props.error}</div> : null}
    </form>
  );
}
