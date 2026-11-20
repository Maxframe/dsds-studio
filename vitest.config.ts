import { defineConfig } from 'vitest/config';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@shared': r('./src/shared'), '@server': r('./src/server'), '@web': r('./src/web') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    testTimeout: 60_000,
    // Snapshots of test projects go to a throwaway folder, never into the app's data folder.
    env: { DSDS_DATA: mkdtempSync(join(tmpdir(), 'dsds-data-')) },
  },
});
