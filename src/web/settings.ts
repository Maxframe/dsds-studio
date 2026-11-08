import { useCallback, useEffect, useState } from 'react';

/**
 * Per-viewer display settings. They only change CSS: `data-theme` (colour scheme), `data-base`
 * (neutral palette) and `data-radius` on <html>, which tokens.css reacts to.
 */
export const SCHEMES = ['system', 'light', 'dark'] as const;
export const BASES = ['neutral', 'zinc', 'stone', 'slate'] as const;
export const RADII = ['none', 'small', 'default', 'large'] as const;

export interface Settings {
  scheme: (typeof SCHEMES)[number];
  base: (typeof BASES)[number];
  radius: (typeof RADII)[number];
}

export const DEFAULT_SETTINGS: Settings = { scheme: 'system', base: 'neutral', radius: 'default' };
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
}

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
