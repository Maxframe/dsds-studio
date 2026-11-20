import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Per-viewer display settings. Most only change CSS: `data-theme` (colour scheme), `data-base`
 * (neutral palette) and `data-radius` on <html>, which tokens.css reacts to. `help` decides how a
 * field's description is shown, so the form reads it from `HelpContext` (it is also mirrored as
 * `data-help` on <html>):
 * - `inline`: the text sits under the label (the default)
 * - `icon`: an info icon next to the label shows the text as a tooltip
 * - `hover`: the text is hidden and shown as a tooltip while the label is hovered
 */
export const SCHEMES = ['system', 'light', 'dark'] as const;
export const BASES = ['neutral', 'zinc', 'stone', 'slate'] as const;
export const RADII = ['none', 'small', 'default', 'large'] as const;
export const HELP_MODES = ['inline', 'icon', 'hover'] as const;
export type HelpMode = (typeof HELP_MODES)[number];

export interface Settings {
  scheme: (typeof SCHEMES)[number];
  base: (typeof BASES)[number];
  radius: (typeof RADII)[number];
  help: HelpMode;
}

export const DEFAULT_SETTINGS: Settings = {
  scheme: 'system',
  base: 'neutral',
  radius: 'default',
  help: 'inline',
};
const KEY = 'dsds-studio.settings';

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return {
      scheme: pick(SCHEMES, s.scheme, DEFAULT_SETTINGS.scheme),
      base: pick(BASES, s.base, DEFAULT_SETTINGS.base),
      radius: pick(RADII, s.radius, DEFAULT_SETTINGS.radius),
      help: pick(HELP_MODES, s.help, DEFAULT_SETTINGS.help),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Writes the settings onto <html>. The default value of each is the absence of the attribute. */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement) {
  const set = (name: string, value: string | null) =>
    value === null ? root.removeAttribute(name) : root.setAttribute(name, value);
  set('data-theme', s.scheme === 'system' ? null : s.scheme);
  set('data-base', s.base === 'neutral' ? null : s.base);
  set('data-radius', s.radius === 'default' ? null : s.radius);
  set('data-help', s.help === 'inline' ? null : s.help);
}

/** How field descriptions are shown; provided by the project view, read by the form. */
export const HelpContext = createContext<HelpMode>(DEFAULT_SETTINGS.help);
export const useHelpMode = () => useContext(HelpContext);

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => applySettings(settings), [settings]);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* per-viewer convenience only */
      }
      return next;
    });
  }, []);
  return [settings, update];
}
