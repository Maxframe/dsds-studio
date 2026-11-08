import type { ComponentProps } from 'react';
import { cn } from '@web/lib/utils';
import { fieldClass } from './input';

/**
 * shadcn/ui Textarea (new-york-v4), adapted like Input. `field-sizing-content` is dropped: the
 * form sizes each textarea with `rows` from its content and caps it. Resizing is vertical only.
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('flex min-h-16 resize-y', fieldClass, className)}
      {...props}
    />
  );
}
