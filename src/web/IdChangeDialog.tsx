import { Button } from '@web/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@web/components/ui/dialog';

export interface IdChange {
  from: string;
  to: string;
  /** How many pointers (in other entries, or this one) name the old id. */
  count: number;
}

const places = (n: number) => `${n} place${n === 1 ? '' : 's'}`;

/**
 * Asks before an entry's id changes. A published id should not change (Specification §3.1), because
 * every pointer to it breaks; to rename something, change its name. If the id must change, the
 * pointers can be updated with it. Links written in text (`dsds:old-id`) are not.
 */
export function IdChangeDialog(props: {
  change: IdChange | null;
  onCancel(): void;
  onOnly(): void;
  onUpdate(): void;
}) {
  const { change } = props;
  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the id “{change?.from}”?</DialogTitle>
          <DialogDescription>
            {change
              ? `${places(change.count)} ${change.count === 1 ? 'points' : 'point'} at ${change.from}.`
              : ''}{' '}
            A published id should not change, because everything that points at it breaks. To rename
            something, change its name instead; the id stays.
          </DialogDescription>
        </DialogHeader>
        <p className="field-note">
          Links written inside text, like dsds:{change?.from}, are not updated either way.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={props.onOnly}>
            Change id only
          </Button>
          <Button onClick={props.onUpdate}>
            Change id and update {change?.count} pointer{change?.count === 1 ? '' : 's'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
