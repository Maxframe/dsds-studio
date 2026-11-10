import { useState } from 'react';
import type { DraftState, VersionInfo } from '@shared/types';
import { Button } from '@web/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';

/** What to do with unsaved changes before restoring: keep them as a quicksave, or drop them. */
export type RestoreMode = 'none' | 'quicksave' | 'discard';

/**
 * Confirms restoring a version. The files become that version and are saved as a new version on top,
 * so nothing is lost. With unsaved changes it asks first: quicksave them, discard them, or cancel.
 */
export function RestoreDialog(props: {
  version: VersionInfo | null;
  draft: DraftState | null;
  onRestore(version: VersionInfo, how: RestoreMode): Promise<void>;
  onClose(): void;
}) {
  const { version, draft } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft?.changed.length ?? 0;

  const run = async (how: RestoreMode) => {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      await props.onRestore(version, how);
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={version !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          props.onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore “{version?.label}”?</DialogTitle>
          <DialogDescription>
            The files will match that version and be saved as a new version on top. Nothing is
            deleted from the history.
          </DialogDescription>
        </DialogHeader>
        {changed > 0 ? (
          <p className="field-note field-note--error" role="alert">
            You have unsaved changes in {changed} file{changed === 1 ? '' : 's'}. Quicksave them
            first, or discard them (they are kept in a git stash).
          </p>
        ) : null}
        {error ? <p className="field-note field-note--error">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={props.onClose}>
            Cancel
          </Button>
          {changed > 0 ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void run('discard')}>
                Discard and restore
              </Button>
              <Button disabled={busy} onClick={() => void run('quicksave')}>
                Quicksave and restore
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => void run('none')}>
              Restore
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
