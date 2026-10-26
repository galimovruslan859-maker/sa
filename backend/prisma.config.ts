import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';

/**
 * Prisma Config (Prisma 6.19+, experimentальный JS Schema Engine).
 *
 * Проект работает с НАСТОЯЩИМ PostgreSQL:
 *
 *  1. Режим «embedded» (по умолчанию, DATABASE_ENGINE=pglite)
 *     PostgreSQL 17, скомпилированный в WebAssembly (PGlite), данные лежат
 *     в папке backend/.pgdata. Не требует установленного сервера — удобно
 *     для разработки, демонстрации и защиты курсовой.
 *
 *  2. Режим «server» (DATABASE_ENGINE=pg + DATABASE_URL)
 *     Обычный сервер PostgreSQL (локально или на хостинге, см. docker-compose.yml).
 *
 * В обоих случаях используется один и тот же schema.prisma, одни и те же
 * миграции и один и тот же Prisma Client.
 */
const engine = process.env.DATABASE_ENGINE ?? 'pglite';
const rootDir = process.cwd();

function resolveDir(p: string): string {
  return path.isAbsolute(p) ? p : path.join(rootDir, p);
}

const dataDir = resolveDir(process.env.PGLITE_DATA_DIR ?? './.pgdata');

export default defineConfig({
  schema: path.join(rootDir, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(rootDir, 'prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  experimental: { adapter: true },
  engine: 'js',
  adapter: async () => {
    if (engine === 'pg') {
      // Реальный сервер PostgreSQL
      const { PrismaPg } = await import('@prisma/adapter-pg');
      return new PrismaPg({ connectionString: process.env.DATABASE_URL }) as never;
    }
    // Embedded PostgreSQL (WASM)
    return new PrismaPGlite(new PGlite(dataDir)) as never;
  },
});
