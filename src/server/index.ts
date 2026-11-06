import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApi } from './api';

export const app = new Hono();
app.route('/', createApi());
app.use('/*', serveStatic({ root: './dist/web' }));

if (process.env.VITEST === undefined) {
  const port = Number(process.env.PORT ?? 4317);
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
    console.log(`DSDS Studio server on http://127.0.0.1:${port}`),
  );
}
