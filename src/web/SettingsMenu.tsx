import type { LucideIcon } from 'lucide-react';
import {
  Info,
  Monitor,
  Moon,
  MousePointer2,
  Settings as SettingsIcon,
  Sun,
  Text,
} from 'lucide-react';
import { IconButton } from './IconButton';
import { Popover, PopoverContent, PopoverTrigger } from '@web/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@web/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@web/components/ui/toggle-group';
import { BASES, HELP_MODES, RADII, SCHEMES, type HelpMode, type Settings } from './settings';

const SCHEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const HELP_ICON = { inline: Text, icon: Info, hover: MousePointer2 } as const;
const HELP_HINT: Record<HelpMode, string> = {
  inline: 'Help text is shown below each field label.',
  icon: 'An info icon next to the label shows the help text on hover or focus.',
  hover: 'Help text is hidden and shown while hovering a field label.',
};
const HELP_LABEL: Record<HelpMode, string> = {
  inline: 'Below',
  icon: 'Icon',
  hover: 'Hover',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A single-choice toggle group that ignores the "nothing selected" event Radix sends on re-click. */
function Choice<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  onChange(v: T): void;
  icons?: Partial<Record<T, LucideIcon>>;
  labels?: Partial<Record<T, string>>;
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
            {props.labels?.[o] ?? cap(o)}
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
        <IconButton variant="ghost" size="icon" label="Settings">
          <SettingsIcon />
        </IconButton>
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
        <Row label="Field help">
          <Choice
            label="Field help"
            value={settings.help}
            options={HELP_MODES}
            labels={HELP_LABEL}
            icons={HELP_ICON}
            onChange={(help) => onChange({ help })}
          />
          <span className="text-xs text-muted-foreground">{HELP_HINT[settings.help]}</span>
        </Row>
      </PopoverContent>
    </Popover>
  );
}
