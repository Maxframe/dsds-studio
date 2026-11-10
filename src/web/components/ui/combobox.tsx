import { Combobox as ComboboxPrimitive } from '@base-ui/react';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { cn } from '@web/lib/utils';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';

/**
 * shadcn/ui Combobox (Base UI), from `npx shadcn view combobox`, adapted to our tokens: sizes come
 * from control tokens, the popup uses our shadow and border, and the enter/exit animation classes
 * (they need tw-animate-css) and the chips parts (unused) are left out.
 */
export const Combobox = ComboboxPrimitive.Root;

export function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

export function ComboboxTrigger({
  className,
  children,
  ...props
}: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon
        data-slot="combobox-trigger-icon"
        className="pointer-events-none size-4 text-muted-foreground"
      />
    </ComboboxPrimitive.Trigger>
  );
}

export function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton />}
      // Inside the field, so the browser's own tooltip (title) rather than a floating one.
      aria-label="Clear"
      title="Clear"
      className={cn(className)}
      {...props}
    >
      <XIcon className="pointer-events-none size-4" />
    </ComboboxPrimitive.Clear>
  );
}

export function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: Omit<ComboboxPrimitive.Input.Props, 'className'> & {
  /** Styles the whole group (the input and its buttons), not the inner input. */
  className?: string;
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={className}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showClear && <ComboboxClear disabled={disabled} />}
        {showTrigger && (
          <InputGroupButton asChild data-slot="input-group-button" disabled={disabled}>
            <ComboboxTrigger aria-label="Show options" title="Show options" />
          </InputGroupButton>
        )}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

export function ComboboxContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            'group/combobox-content relative w-96 max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-md border border-input bg-popover text-popover-foreground [box-shadow:var(--shadow-popover)]',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

export function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        'max-h-[min(var(--layout-suggest-max-height),var(--available-height))] scroll-py-1 overflow-y-auto p-1 data-empty:p-0',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-8 pl-2 outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        data-slot="combobox-item-indicator"
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

export function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

export function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn('px-2 py-1 text-(length:--text-small) text-muted-foreground', className)}
      {...props}
    />
  );
}

export function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

export function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        'hidden w-full justify-center px-2 py-1 text-center text-muted-foreground group-data-empty/combobox-content:flex',
        className,
      )}
      {...props}
    />
  );
}

export function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}
