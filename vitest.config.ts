import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@shared': r('./src/shared'), '@server': r('./src/server'), '@web': r('./src/web') },
  },
  test: { include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'], testTimeout: 60_000 },
});
