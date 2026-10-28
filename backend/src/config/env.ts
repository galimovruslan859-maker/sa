import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

const ROOT_DIR = process.cwd();

dotenv.config({ path: path.resolve(ROOT_DIR, '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_ENGINE: z.enum(['pglite', 'pg']).default('pglite'),
  DATABASE_URL: z.string().default('postgresql://resell:resell@localhost:5432/resell'),
  PGLITE_DATA_DIR: z.string().default('./.pgdata'),
  JWT_SECRET: z.string().min(8).default('resell-dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  /** Каталог production-сборки фронтенда — раздаётся тем же сервером (SPA на одном порту с API) */
  FRONTEND_DIST: z.string().default('../frontend/dist'),
  DEBUG_SQL: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Некорректные переменные окружения:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  /** Абсолютный путь к каталогу данных встроенного PostgreSQL */
  pgliteDataDir: path.isAbsolute(raw.PGLITE_DATA_DIR)
    ? raw.PGLITE_DATA_DIR
    : path.resolve(ROOT_DIR, raw.PGLITE_DATA_DIR),
  /** Абсолютный путь к каталогу загрузок */
  uploadDir: path.isAbsolute(raw.UPLOAD_DIR)
    ? raw.UPLOAD_DIR
    : path.resolve(ROOT_DIR, raw.UPLOAD_DIR),
  /** Абсолютный путь к сборке фронтенда (если её нет — API работает без статики) */
  frontendDist: path.isAbsolute(raw.FRONTEND_DIST)
    ? raw.FRONTEND_DIST
    : path.resolve(ROOT_DIR, raw.FRONTEND_DIST),
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
