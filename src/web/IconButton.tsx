import type { ComponentProps } from 'react';
import { Button } from '@web/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@web/components/ui/tooltip';

/**
 * A button that shows only an icon (or a symbol). It always has an accessible name and a tooltip
 * with the same text, so what it does is discoverable on hover and for screen readers. A button
 * with visible text does not need this.
 *
 * `data-tooltip` marks it for the test that checks every icon button in the app. A disabled button
 * cannot be hovered, so it sits in a span that can (and can take keyboard focus).
 */
export function IconButton({
  label,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, 'aria-label' | 'title'> & { label: string }) {
  const button = <Button aria-label={label} data-tooltip={label} disabled={disabled} {...props} />;
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          {disabled ? (
            <span tabIndex={0} className="inline-flex">
              {button}
            </span>
          ) : (
            button
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
