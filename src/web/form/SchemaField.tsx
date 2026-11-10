import { Button } from '@web/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { MarkdownWidget } from './MarkdownWidget';
import { OpenSetWidget } from './OpenSetWidget';
import { useState } from 'react';
import {
  defaultValueFor,
  effective,
  kindOptions,
  type EffectiveSchema,
  type SchemaNode,
} from '@shared/schema';
import { buildPointer } from '@shared/pointer';
import { findingsAt, useForm } from './context';
import { IconButton } from '../IconButton';
import { RemoveField } from './RemoveField';
import {
  BooleanWidget,
  NumberWidget,
  RawYamlWidget,
  RefTargetWidget,
  SelectWidget,
  TextWidget,
} from './widgets';

interface FieldProps {
  node: SchemaNode;
  value: unknown;
  /** JSON Pointer of this field in the open file. */
  pointer: string;
  label?: string;
  required?: boolean;
  /** Show a control to remove this field from its parent (optional object fields only). */
  removable?: boolean;
  /** Keys not to show (the caller edits them elsewhere). */
  hide?: string[];
}

type Widget =
  'ref' | 'select' | 'boolean' | 'number' | 'markdown' | 'text' | 'object' | 'list' | 'raw';

/** Pick a widget from what the schema says the field is, never from its name. */
function pickWidget(eff: EffectiveSchema, value: unknown): Widget {
  if (eff.refNames.some((n) => n.startsWith('common/ref#/$defs/to'))) return 'ref';
  if (eff.enum && eff.enum.length) return 'select';
  const type =
    eff.type ??
    (Array.isArray(value)
      ? 'array'
      : value !== null && typeof value === 'object'
        ? 'object'
        : typeof value);
  switch (type) {
    case 'boolean':
      return 'boolean';
    case 'integer':
    case 'number':
      return 'number';
    case 'string':
      return eff.refNames.includes('common/markdown') ? 'markdown' : 'text';
    case 'object':
      return eff.properties.length > 0 && !eff.keyPattern ? 'object' : 'raw';
    case 'array':
      return eff.items ? 'list' : 'raw';
    default:
      return 'raw';
  }
}

/** Plain-text first line of a (possibly Markdown) schema description. */
const brief = (text?: string) => text?.replace(/`/g, '').split('\n')[0];

export function SchemaField({
  node,
  value,
  pointer,
  label,
  required,
  removable,
  hide,
}: FieldProps) {
  const ctx = useForm();
  const eff = effective(ctx.bundle, node, value);
  const widget = pickWidget(eff, value);
  const [error, setError] = useState<string | null>(null);

  const commit = (v: unknown) => {
    setError(null);
    ctx
      .apply([v === undefined ? { op: 'remove', pointer } : { op: 'set', pointer, value: v }])
      .catch((e: Error) => setError(e.message));
  };
  const common = { pointer, value, onCommit: commit, required };

  let body;
  switch (widget) {
    case 'ref':
      body = <RefTargetWidget {...common} />;
      break;
    case 'select':
      body = <SelectWidget {...common} options={eff.enum ?? []} />;
      break;
    case 'boolean':
      body = <BooleanWidget {...common} />;
      break;
    case 'number':
      body = <NumberWidget {...common} />;
      break;
    case 'markdown':
      body = <MarkdownWidget {...common} />;
      break;
    case 'text': {
      const standard = eff.suggestions?.filter((s): s is string => typeof s === 'string') ?? [];
      const placeholder = typeof eff.example === 'string' ? eff.example : undefined;
      body = standard.length ? (
        <OpenSetWidget {...common} standard={standard} usage={ctx.usage(pointer)} />
      ) : (
        <TextWidget {...common} placeholder={placeholder} />
      );
      break;
    }
    case 'object':
      body = <ObjectFields eff={eff} value={value} pointer={pointer} hide={hide} />;
      break;
    case 'list':
      body = <ListField eff={eff} value={value} pointer={pointer} label={label} />;
      break;
    default:
      body = <RawYamlWidget {...common} />;
  }

  const grouped = widget === 'object' || widget === 'list';
  return (
    <FieldShell
      pointer={pointer}
      label={label}
      required={required}
      removable={removable && value !== undefined}
      value={value}
      description={brief(eff.description)}
      grouped={grouped}
      error={error}
      inline={widget === 'boolean'}
    >
      {body}
    </FieldShell>
  );
}

function FieldShell(props: {
  pointer: string;
  label?: string;
  required?: boolean;
  removable?: boolean;
  value?: unknown;
  description?: string;
  grouped: boolean;
  inline?: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  const ctx = useForm();
  const findings = findingsAt(ctx, props.pointer);
  // A leaf field also lights up when the focus is somewhere inside it (e.g. inside raw YAML).
  const focused =
    ctx.focus === props.pointer ||
    (!props.grouped && (ctx.focus?.startsWith(`${props.pointer}/`) ?? false));
  const classes = [
    'field',
    props.grouped && 'field--group',
    props.inline && 'field--inline',
    focused && 'field--focus',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} data-pointer={props.pointer}>
      {props.label ? (
        <div className="field-head">
          <label className="field-label" htmlFor={props.pointer}>
            {props.label}
            {props.required ? <span className="field-required"> *</span> : null}
          </label>
          {props.removable ? (
            <RemoveField pointer={props.pointer} label={props.label} value={props.value} />
          ) : null}
        </div>
      ) : null}
      {props.description && !props.grouped ? (
        <div className="field-help">{props.description}</div>
      ) : null}
      {props.children}
      {props.error ? <div className="field-note field-note--error">{props.error}</div> : null}
      {findings.map((f, i) => (
        <div key={i} className={`field-note field-note--${f.severity}`}>
          {f.rule ? <strong>{f.rule}: </strong> : null}
          {f.message}
          {f.fix ? <div className="muted">{f.fix}</div> : null}
        </div>
      ))}
    </div>
  );
}

function ObjectFields({
  eff,
  value,
  pointer,
  hide = [],
}: {
  eff: EffectiveSchema;
  value: unknown;
  pointer: string;
  hide?: string[];
}) {
  const ctx = useForm();
  const obj = (value !== null && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const declared = eff.properties.filter((p) => !hide.includes(p.key));
  const shown = declared.filter((p) => p.key in obj || eff.required.includes(p.key));
  const addable = declared.filter((p) => !shown.includes(p));
  const known = new Set(eff.properties.map((p) => p.key));
  const unknown = Object.keys(obj).filter((k) => !known.has(k) && !hide.includes(k));

  return (
    <div className="object">
      {shown.map((p) => (
        <SchemaField
          key={p.key}
          node={p.node}
          value={obj[p.key]}
          pointer={`${pointer}${buildPointer([p.key])}`}
          label={p.key}
          required={eff.required.includes(p.key)}
          removable={!eff.required.includes(p.key)}
        />
      ))}
      {unknown.map((k) => (
        <div key={k} className="field" data-pointer={`${pointer}${buildPointer([k])}`}>
          <div className="field-head">
            <label className="field-label" htmlFor={`${pointer}${buildPointer([k])}`}>
              {k} <span className="badge">not in schema</span>
            </label>
            <RemoveField pointer={`${pointer}${buildPointer([k])}`} label={k} value={obj[k]} />
          </div>
          <RawYamlWidget
            pointer={`${pointer}${buildPointer([k])}`}
            value={obj[k]}
            onCommit={(v) =>
              void ctx.apply([
                v === undefined
                  ? { op: 'remove', pointer: `${pointer}${buildPointer([k])}` }
                  : { op: 'set', pointer: `${pointer}${buildPointer([k])}`, value: v },
              ])
            }
          />
        </div>
      ))}
      {addable.length > 0 ? (
        <Select
          value=""
          onValueChange={(key) => {
            const prop = addable.find((p) => p.key === key);
            if (!prop) return;
            void ctx.apply([
              {
                op: 'set',
                pointer: `${pointer}${buildPointer([prop.key])}`,
                value: defaultValueFor(ctx.bundle, prop.node),
              },
            ]);
          }}
        >
          <SelectTrigger aria-label="Add field" className="w-auto">
            <SelectValue placeholder="+ Add field…" />
          </SelectTrigger>
          <SelectContent>
            {addable.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

/** A short human label for a list item, read from whatever identifying text it has. */
function itemLabel(item: unknown, index: number): string {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    const kind = typeof o.kind === 'string' ? o.kind : '';
    const text = ['title', 'name', 'term', 'statement', 'id', 'to', 'href', 'subject']
      .map((k) => o[k])
      .find((v): v is string => typeof v === 'string' && v !== '');
    const label = [kind, text].filter(Boolean).join(': ');
    if (label) return label.length > 80 ? `${label.slice(0, 77)}…` : label;
  }
  return `#${index + 1}`;
}

function ListField({
  eff,
  value,
  pointer,
  label,
}: {
  eff: EffectiveSchema;
  value: unknown;
  pointer: string;
  label?: string;
}) {
  const ctx = useForm();
  const items = Array.isArray(value) ? value : [];
  const itemNode = eff.items as SchemaNode;
  const itemEff = effective(ctx.bundle, itemNode, undefined);

  // Lists of plain strings (tags, aliases) are one line each in a textarea.
  if (itemEff.type === 'string' && !itemEff.variantNodes) {
    return (
      <TextWidget
        pointer={pointer}
        value={items.join('\n')}
        multiline
        onCommit={(v) => {
          const list =
            typeof v === 'string'
              ? v
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          void ctx.apply([
            list.length ? { op: 'set', pointer, value: list } : { op: 'remove', pointer },
          ]);
        }}
        placeholder="One per line"
      />
    );
  }

  const add = (seed: unknown, node: SchemaNode) => {
    const item = defaultValueFor(ctx.bundle, node, seed);
    void ctx.apply([
      Array.isArray(value)
        ? { op: 'append', pointer, value: item }
        : { op: 'set', pointer, value: [item] },
    ]);
  };
  const kinds = kindOptions(ctx.bundle, itemNode);
  const variants =
    !kinds.length && itemEff.variantNodes && itemEff.variantNodes.length > 1
      ? itemEff.variantNodes
      : [];

  return (
    <div className="list">
      {items.map((item, i) => (
        <ListItem
          key={i}
          pointer={`${pointer}/${i}`}
          listPointer={pointer}
          index={i}
          count={items.length}
          label={itemLabel(item, i)}
          startOpen={items.length <= 3}
        >
          <SchemaField node={itemNode} value={item} pointer={`${pointer}/${i}`} hide={undefined} />
        </ListItem>
      ))}
      {kinds.length > 0 ? (
        <Select value="" onValueChange={(k) => add({ kind: k }, itemNode)}>
          <SelectTrigger aria-label={`Add ${label ?? 'item'}`} className="w-auto">
            <SelectValue placeholder={`+ Add ${label ?? 'item'}…`} />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : variants.length ? (
        <div className="list-add">
          {variants.map((v, i) => {
            const ve = effective(ctx.bundle, v, undefined);
            return (
              <Button key={i} variant="outline" onClick={() => add(undefined, v)}>
                + Add {ve.type === 'string' ? 'text link' : 'pointer'}
              </Button>
            );
          })}
        </div>
      ) : (
        <Button variant="outline" onClick={() => add(undefined, itemNode)}>
          + Add {label ?? 'item'}
        </Button>
      )}
    </div>
  );
}

function ListItem(props: {
  pointer: string;
  listPointer: string;
  index: number;
  count: number;
  label: string;
  startOpen: boolean;
  children: React.ReactNode;
}) {
  const ctx = useForm();
  // The user's own toggle wins; otherwise open small lists and the item holding the focused field.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open =
    toggled ?? (props.startOpen || (ctx.focus?.startsWith(`${props.pointer}/`) ?? false));
  const move = (to: number) =>
    void ctx.apply([{ op: 'move', pointer: props.listPointer, from: props.index, to }]);
  return (
    <div className="list-item" data-pointer={`${props.pointer}#item`}>
      <div className="list-item-head">
        <button
          type="button"
          className="link-button"
          onClick={() => setToggled(!open)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} {props.label}
        </button>
        <span className="list-item-actions">
          <IconButton
            variant="ghost"
            size="icon-xs"
            disabled={props.index === 0}
            onClick={() => move(props.index - 1)}
            label="Move up"
          >
            ↑
          </IconButton>
          <IconButton
            variant="ghost"
            size="icon-xs"
            disabled={props.index === props.count - 1}
            onClick={() => move(props.index + 1)}
            label="Move down"
          >
            ↓
          </IconButton>
          <IconButton
            variant="ghost"
            size="icon-xs"
            onClick={() => void ctx.apply([{ op: 'remove', pointer: props.pointer }])}
            label="Remove"
          >
            ✕
          </IconButton>
        </span>
      </div>
      {open ? <div className="list-item-body">{props.children}</div> : null}
    </div>
  );
}
