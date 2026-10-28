import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import categoryRoutes from './routes/category.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import favoriteRoutes from './routes/favorite.routes';
import reviewRoutes from './routes/review.routes';
import adminRoutes from './routes/admin.routes';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);

  // --- Безопасность ---
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        // Разрешаем запросы без Origin (curl, Postman, мобильные клиенты)
        if (!origin) return callback(null, true);
        const allowed = env.corsOrigins.some(
          (o) => o === '*' || o === origin || origin.startsWith(o.replace(/\/$/, '')),
        );
        return callback(null, allowed || env.corsOrigins.includes('*'));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  if (!env.isProduction) app.use(morgan('dev'));

  // Общие лимиты: жёстче для auth, мягче для остального API
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  // --- Статика: загруженные фотографии товаров ---
  app.use('/uploads', express.static(env.uploadDir, { maxAge: '7d', index: false }));

  // --- Служебный маршрут ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'RESELL API',
      time: new Date().toISOString(),
      database: env.DATABASE_ENGINE,
    });
  });

  // --- Маршруты API ---
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/favorites', favoriteRoutes);
  app.use('/api/reviews', reviewRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFoundHandler);

  // --- Раздача собранного фронтенда (SPA) ------------------------------------
  // Если production-сборка существует, магазин и API работают на одном порту:
  //   GET /            -> dist/index.html
  //   GET /catalog     -> dist/index.html (маршруты обрабатывает React Router)
  //   GET /assets/*    -> статика сборки
  //   /api/* и /uploads/* обработаны выше и сюда не попадают.
  // В Docker-развёртывании статику отдаёт nginx, поэтому папки dist здесь нет —
  // блок просто не подключается.
  const indexHtml = path.join(env.frontendDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(
      express.static(env.frontendDist, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            // файлы сборки содержат хэш в имени — кэшируем надолго
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );

    app.get(/^\/(?!api|uploads).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);

  return app;
}

export { path };
