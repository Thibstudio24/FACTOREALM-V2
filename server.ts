import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './src/server/api';
import { initDatabase } from './src/server/db';

async function startServer() {
  const ctx = initDatabase();
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use('/api/v1', createApiRouter(ctx));

  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`Factorealm prêt sur http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Échec démarrage serveur Factorealm:', err);
  process.exit(1);
});
