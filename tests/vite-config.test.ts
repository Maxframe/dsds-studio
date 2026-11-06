import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../vite.config';

// Vite's dev proxy matches by URL prefix. A rule like '/api' also catches /api.ts, so the import
// of src/web/api.ts went to the backend, 404'd, and left the page blank.
describe('vite dev proxy', () => {
  const root = join(__dirname, '../src/web');
  const urls: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else urls.push('/' + relative(root, p).split('\\').join('/'));
    }
  })(root);

  it('never captures a source file of the web app', () => {
    const keys = Object.keys(config.server?.proxy ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const matches = (url: string) =>
        key.startsWith('^') ? new RegExp(key).test(url) : url.startsWith(key);
      expect(urls.filter(matches)).toEqual([]);
      expect(matches('/api/projects')).toBe(true);
    }
  });
});
