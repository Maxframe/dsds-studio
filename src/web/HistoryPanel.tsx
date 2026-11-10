import { useCallback, useEffect, useState } from 'react';
import { History, Tag } from 'lucide-react';
import type { VersionInfo } from '@shared/types';
import { Button } from '@web/components/ui/button';
import { Input } from '@web/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@web/components/ui/popover';
import { api } from './api';
import { IconButton } from './IconButton';

const pad = (n: number) => String(n).padStart(2, '0');
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Editing = { id: string; what: 'name' | 'tag' };

/**
 * The history: saved versions, newest first. Quicksaves are folded away so the named versions
 * stand out; either kind can be tagged later, and a quicksave can be given a name.
 */
export function HistoryPanel({
  slug,
  refreshKey,
  onCompare,
  onRestore,
}: {
  slug: string;
  refreshKey: unknown;
  onCompare(version: VersionInfo): void;
  onRestore(version: VersionInfo): void;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  const [showQuick, setShowQuick] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api
        .versions(slug)
        .then(setVersions)
        .catch((e: Error) => setError(e.message)),
    [slug],
  );
  // Reload when opened, and when the draft changes (a save adds a version).
  useEffect(() => {
    if (open) void load();
  }, [open, load, refreshKey]);

  const apply = async () => {
    if (!editing) return;
    setError(null);
    try {
      const next =
        editing.what === 'tag'
          ? await api.tagVersion(slug, editing.id, text)
          : await api.nameVersion(slug, editing.id, text);
      setVersions(next);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const startEditing = (id: string, what: Editing['what']) => {
    setError(null);
    setText('');
    setEditing(editing?.id === id && editing.what === what ? null : { id, what });
  };

  const quicks = versions?.filter((v) => v.kind === 'quicksave').length ?? 0;
  const shown = versions?.filter((v) => showQuick || v.kind === 'named') ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="History">
          <History /> History
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="grid max-h-96 w-96 max-w-(--radix-popover-content-available-width) gap-2 overflow-x-hidden overflow-y-auto [&>*]:min-w-0"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="history-title">History</h2>
          {quicks > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={showQuick}
              onClick={() => setShowQuick((v) => !v)}
            >
              {showQuick ? 'Hide' : 'Show'} {quicks} quicksave{quicks === 1 ? '' : 's'}
            </Button>
          ) : null}
        </div>
        {versions && versions.length === 0 ? <p className="muted">No version saved yet.</p> : null}
        <ul className="m-0 grid list-none gap-1 p-0">
          {shown.map((v) => (
            <li key={v.id} className="history-item min-w-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={v.label}>
                  {v.label}
                </span>
                {v.kind === 'named' ? null : <span className="badge">quicksave</span>}
              </div>
              {/* Date and tags on the left, the actions on the right; wraps when it is tight. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
                <span className="text-xs">{when(v.date)}</span>
                {v.tags.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
                <span className="ml-auto flex items-center">
                  {v.kind === 'quicksave' ? (
                    <Button variant="ghost" size="xs" onClick={() => startEditing(v.id, 'name')}>
                      Name
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`Compare ${v.label}`}
                    onClick={() => {
                      setOpen(false);
                      onCompare(v);
                    }}
                  >
                    Compare
                  </Button>
                  {/* The newest version is what the files are based on: nothing to go back to. */}
                  {versions && v.id !== versions[0]?.id ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      aria-label={`Restore ${v.label}`}
                      onClick={() => {
                        setOpen(false);
                        onRestore(v);
                      }}
                    >
                      Restore
                    </Button>
                  ) : null}
                  <IconButton
                    variant="ghost"
                    size="icon-xs"
                    label={`Tag ${v.label}`}
                    onClick={() => startEditing(v.id, 'tag')}
                  >
                    <Tag />
                  </IconButton>
                </span>
              </div>
              {editing?.id === v.id ? (
                <form
                  className="grid gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void apply();
                  }}
                >
                  <Input
                    autoFocus
                    value={text}
                    aria-label={editing.what === 'tag' ? 'Tag name' : 'Version name'}
                    placeholder={editing.what === 'tag' ? 'for example 1.4.0' : 'What changed'}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  />
                  {error ? <p className="field-note field-note--error">{error}</p> : null}
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {!editing && error ? <p className="field-note field-note--error">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
