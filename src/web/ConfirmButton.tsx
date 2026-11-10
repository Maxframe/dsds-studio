import { useState } from 'react';
import { Button } from '@web/components/ui/button';
import { cn } from '@web/lib/utils';
import { IconButton } from './IconButton';

/** A destructive action that needs a second click. No browser dialog, so it is also testable. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel?: string;
  /** What will happen, shown once the button is armed. */
  hint?: string;
  /** Extra classes for the compact button, e.g. its placement. */
  className?: string;
  onConfirm(): void;
  compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <>
        {props.compact ? (
          <IconButton
            variant="ghost"
            size="icon-xs"
            className={props.className}
            label={props.label}
            onClick={() => setArmed(true)}
          >
            ✕
          </IconButton>
        ) : (
          <Button
            variant="ghost"
            className={cn('text-destructive hover:text-destructive', props.className)}
            onClick={() => setArmed(true)}
          >
            {props.label}
          </Button>
        )}
      </>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={`Confirm: ${props.label}`}>
      {props.hint ? <span className="confirm-hint">{props.hint}</span> : null}
      <Button
        variant="destructive"
        onClick={() => {
          setArmed(false);
          props.onConfirm();
        }}
      >
        {props.confirmLabel ?? 'Confirm'}
      </Button>
      <Button variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
