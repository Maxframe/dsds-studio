import { useState } from 'react';
import type { DraftState, VersionInfo } from '@shared/types';
import { Button } from '@web/components/ui/button';
import { Checkbox } from '@web/components/ui/checkbox';
import { Input } from '@web/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@web/components/ui/popover';
import { ChangesDialog, type CompareTarget } from './ChangesDialog';
import { ConfirmButton } from './ConfirmButton';
import { HistoryPanel } from './HistoryPanel';
import { RestoreDialog, type RestoreMode } from './RestoreDialog';

const count = (n: number) => `${n} file${n === 1 ? '' : 's'}`;

export interface SaveInput {
  label: string;
  tag: string;
  /** Set `metadata.updated` on the entries that changed (named versions only). */
  stamp: boolean;
}

/**
 * The draft: what has changed since the last saved version. Edits already save to the project's
 * files, so the draft is simply the difference from the last version (ADR 0005). From here it is
 * saved as a quicksave (automatic label) or a named version (label, optional tag), or discarded.
 */
export function DraftBar(props: {
  slug: string;
  draft: DraftState | null;
  onDiscard(): void;
  onQuicksave(): Promise<void>;
  /** Rejects with a message fit to show when the version can't be saved (e.g. a taken tag). */
  onSaveVersion(input: SaveInput): Promise<void>;
  onRestore(version: VersionInfo, how: RestoreMode): Promise<void>;
}) {
  const { draft } = props;
  const [compare, setCompare] = useState<CompareTarget | null>(null);
  const [restoring, setRestoring] = useState<VersionInfo | null>(null);
  if (!draft) return null;
  const changed = draft.changed.length;
  const names = draft.changed.map((c) => `${c.path} (${c.status})`).join(', ');
  const status = !draft.hasVersion
    ? 'No version saved yet'
    : changed === 0
      ? 'No unsaved changes'
      : `Draft: ${count(changed)} changed`;
  return (
    <div className="draft-bar">
      <div className="flex items-center justify-between gap-2">
        <span role="status" title={names} className={changed === 0 ? 'muted' : undefined}>
          {status}
        </span>
        <HistoryPanel
          slug={props.slug}
          refreshKey={draft}
          onCompare={(v) => setCompare({ from: v.id, label: v.label })}
          onRestore={setRestoring}
        />
      </div>
      {changed > 0 ? (
        <div className="draft-actions">
          <Button variant="outline" size="sm" onClick={() => void props.onQuicksave()}>
            Quicksave
          </Button>
          {draft.hasVersion ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompare({ from: 'HEAD', label: 'the last version' })}
            >
              Review changes
            </Button>
          ) : null}
          <SaveVersion suggestedTag={draft.suggestedTag} onSave={props.onSaveVersion} />
          {draft.hasVersion ? (
            <ConfirmButton
              label="Discard changes"
              confirmLabel="Discard"
              hint="Returns the files to the last version. The changes are kept in a git stash."
              onConfirm={props.onDiscard}
            />
          ) : null}
        </div>
      ) : null}
      <ChangesDialog slug={props.slug} target={compare} onClose={() => setCompare(null)} />
      <RestoreDialog
        version={restoring}
        draft={draft}
        onRestore={props.onRestore}
        onClose={() => setRestoring(null)}
      />
    </div>
  );
}

/** The popover for a named version: a label, and an optional tag (the system's version, suggested). */
function SaveVersion(props: {
  suggestedTag: string | null;
  onSave(input: SaveInput): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [tag, setTag] = useState('');
  const [stamp, setStamp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await props.onSave({ label: label.trim(), tag: tag.trim(), stamp });
      setOpen(false);
      setLabel('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setTag(props.suggestedTag ?? '');
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Save version…
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) void submit();
          }}
        >
          <label className="grid gap-1.5 text-sm font-medium">
            Version label
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What changed"
              autoFocus
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Tag (optional)
            <Input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder={props.suggestedTag ?? 'for example 1.4.0'}
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={stamp}
              onCheckedChange={(v) => setStamp(v === true)}
              className="mt-0.5"
            />
            <span>
              Stamp changed entries with today’s date
              <span className="block text-xs text-muted-foreground">
                Sets <code>metadata.updated</code>, which readers use to know when to re-fetch.
              </span>
            </span>
          </label>
          {error ? <p className="field-note field-note--error">{error}</p> : null}
          <Button type="submit" disabled={!label.trim() || busy}>
            Save version
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
