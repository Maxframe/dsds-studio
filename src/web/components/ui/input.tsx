import type { ComponentProps } from 'react';
import { cn } from '@web/lib/utils';

/** The look shared by Input, Textarea and the select trigger (not part of shadcn's files). */
export const fieldClass =
  'w-full min-w-0 rounded-md border border-input bg-card px-2 py-1 text-sm text-foreground transition-[color,box-shadow] duration-(--motion-fast) ease-(--motion-ease) outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:transition-none';

/**
 * shadcn/ui Input (new-york-v4), adapted: height from `--control-height`, `bg-card` for the
 * field, a tighter padding, and no `shadow-xs`, `dark:` or `md:text-sm` classes.
 */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-(--control-height) selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        fieldClass,
        className,
      )}
      {...props}
    />
  );
}
