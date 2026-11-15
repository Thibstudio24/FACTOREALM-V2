import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createApiRouter } from './src/server/api';
import { initDatabase } from './src/server/db';

async function startServer() {
  const ctx = initDatabase();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  });

  app.use('/api/v1', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim();
        const expectedHost = forwardedHost || String(req.headers.host ?? '');
        try {
          const originHost = new URL(origin).host;
          if (expectedHost && originHost !== expectedHost) {
            res.status(403).json({ error: 'Requête inter-origine bloquée par sécurité (CSRF).' });
            return;
          }
        } catch {
          res.status(403).json({ error: 'En-tête Origin invalide.' });
          return;
        }
      }
    }
    next();
  });

  app.use('/api/v1', createApiRouter(ctx));

  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
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
