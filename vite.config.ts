import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: 'src/web',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': r('./src/shared'), '@web': r('./src/web') },
  },
  build: { outDir: '../../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    // Regex key on purpose: a plain '/api' also matches the source file /api.ts and breaks the app.
    proxy: { '^/api/': 'http://localhost:4317' },
  },
});
