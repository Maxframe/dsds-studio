import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@web/lib/utils';
import { Button } from './button';
import { Input } from './input';

/**
 * shadcn/ui InputGroup, trimmed to what Combobox uses (inline addons, one input, icon buttons) and
 * sized from our tokens. The block-aligned addons, text and textarea parts are not copied.
 */
export function InputGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        'group/input-group relative flex min-h-(--control-height) w-full min-w-0 items-center rounded-md border border-input bg-card transition-colors duration-(--motion-fast) ease-(--motion-ease) outline-none motion-reduce:transition-none',
        'has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50',
        'has-[[data-slot][aria-invalid=true]]:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  'flex h-auto cursor-text items-center justify-center gap-2 text-muted-foreground select-none [&>svg:not([class*="size-"])]:size-4',
  {
    variants: {
      align: {
        'inline-start': 'order-first pl-2 has-[>button]:-ml-1',
        'inline-end': 'order-last pr-2 has-[>button]:-mr-1',
      },
    },
    defaultVariants: { align: 'inline-start' },
  },
);

export function InputGroupAddon({
  className,
  align = 'inline-start',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.currentTarget.parentElement?.querySelector('input')?.focus();
      }}
      {...props}
    />
  );
}

export function InputGroupButton({
  className,
  type = 'button',
  variant = 'ghost',
  ...props
}: ComponentProps<typeof Button>) {
  return <Button type={type} variant={variant} size="icon-xs" className={className} {...props} />;
}

export function InputGroupInput({ className, ...props }: ComponentProps<'input'>) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        'min-h-0 min-w-0 flex-1 rounded-none border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}
