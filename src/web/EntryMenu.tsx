import { useState } from 'react';
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@web/components/ui/dropdown-menu';

/**
 * The "more" menu of a tree row. Removing needs a second click: the first keeps the menu open and
 * shows what will happen, so there is no browser dialog (and it stays testable).
 */
export function EntryMenu(props: {
  name: string;
  removeHint: string;
  onDuplicate(): void;
  onRemove(): void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <DropdownMenu onOpenChange={() => setArmed(false)}>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size="icon-xs"
          // The row behind it already has the accent background, so hover needs a step beyond it.
          className="hover:bg-foreground/10 data-[state=open]:bg-foreground/10"
          label={`More actions for ${props.name}`}
        >
          <MoreHorizontal />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={props.onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {armed ? (
          <DropdownMenuLabel className="font-normal">{props.removeHint}</DropdownMenuLabel>
        ) : null}
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            if (!armed) {
              e.preventDefault();
              setArmed(true);
            } else props.onRemove();
          }}
        >
          <Trash2 /> {armed ? 'Confirm remove' : 'Remove'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
