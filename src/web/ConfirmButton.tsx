import { useState } from 'react';
import { Button } from '@web/components/ui/button';
import { cn } from '@web/lib/utils';

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
      <Button
        variant="ghost"
        size={props.compact ? 'icon-xs' : 'default'}
        className={cn(!props.compact && 'text-destructive hover:text-destructive', props.className)}
        aria-label={props.compact ? props.label : undefined}
        title={props.label}
        onClick={() => setArmed(true)}
      >
        {props.compact ? '✕' : props.label}
      </Button>
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
