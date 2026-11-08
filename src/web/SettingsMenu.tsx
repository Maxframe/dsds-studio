import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@web/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@web/components/ui/toggle-group';
import { BASES, RADII, SCHEMES, type Settings } from './settings';

const SCHEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A single-choice toggle group that ignores the "nothing selected" event Radix sends on re-click. */
function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange(v: T): void;
  icons?: Partial<Record<T, LucideIcon>>;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label={props.label}
      value={props.value}
      onValueChange={(v) => v && props.onChange(v as T)}
    >
      {props.options.map((o) => {
        const Icon: LucideIcon | undefined = props.icons?.[o];
        return (
          <ToggleGroupItem key={o} value={o} aria-label={`${props.label}: ${o}`}>
            {Icon ? <Icon /> : null}
            {cap(o)}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

export function SettingsMenu({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <SettingsIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-4">
        <Row label="Color scheme">
          <Choice
            label="Color scheme"
            value={settings.scheme}
            options={SCHEMES}
            icons={SCHEME_ICON}
            onChange={(scheme) => onChange({ scheme })}
          />
        </Row>
        <Row label="Theme">
          <Select
            value={settings.base}
            onValueChange={(base) => onChange({ base: base as Settings['base'] })}
          >
            <SelectTrigger className="w-full" aria-label="Theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BASES.map((b) => (
                <SelectItem key={b} value={b}>
                  {cap(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Corner radius">
          <Choice
            label="Corner radius"
            value={settings.radius}
            options={RADII}
            onChange={(radius) => onChange({ radius })}
          />
        </Row>
      </PopoverContent>
    </Popover>
  );
}
