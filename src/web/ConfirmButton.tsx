import { useState } from 'react';

/** A destructive action that needs a second click. No browser dialog, so it is also testable. */
export function ConfirmButton(props: {
  label: string;
  confirmLabel?: string;
  /** What will happen, shown once the button is armed. */
  hint?: string;
  className?: string;
  onConfirm(): void;
  compact?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button
        type="button"
        className={props.className ?? 'button button--danger'}
        aria-label={props.compact ? props.label : undefined}
        title={props.label}
        onClick={() => setArmed(true)}
      >
        {props.compact ? '✕' : props.label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={`Confirm: ${props.label}`}>
      {props.hint ? <span className="confirm-hint">{props.hint}</span> : null}
      <button
        type="button"
        className="button button--danger"
        onClick={() => {
          setArmed(false);
          props.onConfirm();
        }}
      >
        {props.confirmLabel ?? 'Confirm'}
      </button>
      <button type="button" className="button" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
