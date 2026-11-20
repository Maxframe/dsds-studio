import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@web/components/ui/tooltip';
import { useHelpMode } from '../settings';

function HelpTip({ help, delay, children }: { help: string; delay: number; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={delay}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-sm text-left text-pretty">
          {help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * A field's label, with its help text attached the way the "Field help" setting asks: nothing
 * extra in `inline` mode (FieldShell prints the text under the label), an info icon with a tooltip
 * in `icon` mode, or a tooltip on the label itself in `hover` mode.
 */
export function FieldLabel(props: {
  pointer: string;
  label: string;
  required?: boolean;
  help?: string;
}) {
  const mode = useHelpMode();
  const help = props.help;
  const label = (
    <label
      className={mode === 'hover' && help ? 'field-label field-label--help' : 'field-label'}
      htmlFor={props.pointer}
    >
      {props.label}
      {props.required ? <span className="field-required"> *</span> : null}
    </label>
  );
  if (!help || mode === 'inline') return label;
  if (mode === 'hover') {
    return (
      <HelpTip help={help} delay={300}>
        {label}
      </HelpTip>
    );
  }
  return (
    <span className="field-title">
      {label}
      <HelpTip help={help} delay={0}>
        <button
          type="button"
          className="field-help-icon"
          aria-label={`About ${props.label}`}
          data-tooltip={help}
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </HelpTip>
    </span>
  );
}
