import { PrismaClient } from '../generated/prisma/client';
import { env } from './env';

/**
 * Единственный экземпляр Prisma Client на процесс.
 *
 * Соединение с PostgreSQL устанавливается через driver adapter:
 *  - DATABASE_ENGINE=pglite -> встроенный PostgreSQL (WASM), данные в .pgdata
 *  - DATABASE_ENGINE=pg     -> сервер PostgreSQL из DATABASE_URL
 */
async function createAdapter() {
  if (env.DATABASE_ENGINE === 'pg') {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    return new PrismaPg({ connectionString: env.DATABASE_URL });
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { PrismaPGlite } = await import('pglite-prisma-adapter');
  return new PrismaPGlite(new PGlite(env.pgliteDataDir));
}

let prismaPromise: Promise<PrismaClient> | null = null;

export function getPrisma(): Promise<PrismaClient> {
  if (!prismaPromise) {
    prismaPromise = (async () => {
      const adapter = await createAdapter();
      const client = new PrismaClient({
        // adapter предоставляется драйвером БД, поэтому url из schema.prisma не используется
        adapter: adapter as never,
        log: env.DEBUG_SQL ? ['query', 'warn', 'error'] : ['warn', 'error'],
      });
      await client.$connect();
      return client;
    })().catch((err) => {
      prismaPromise = null;
      throw err;
    });
  }
  return prismaPromise;
}

export type Db = Awaited<ReturnType<typeof getPrisma>>;

export async function disconnectPrisma(): Promise<void> {
  if (prismaPromise) {
    const client = await prismaPromise;
    await client.$disconnect();
    prismaPromise = null;
  }
}
