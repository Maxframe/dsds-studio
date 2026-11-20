import { Search, X } from 'lucide-react';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@web/components/ui/input-group';

/** The filter field above the entry tree: shadcn's InputGroup with a search icon and a clear button. */
export function TreeSearch(props: { value: string; onChange(value: string): void }) {
  return (
    <InputGroup role="search" className="tree-search">
      <InputGroupAddon>
        <Search aria-hidden />
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        aria-label="Filter entries"
        placeholder="Filter entries"
        autoComplete="off"
        spellCheck={false}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && props.value) {
            e.preventDefault();
            props.onChange('');
          }
        }}
      />
      {props.value ? (
        <InputGroupAddon align="inline-end">
          {/* Inside the field, so the browser's own tooltip (title) rather than a floating one. */}
          <InputGroupButton
            aria-label="Clear filter"
            title="Clear filter"
            onClick={() => props.onChange('')}
          >
            <X aria-hidden />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
