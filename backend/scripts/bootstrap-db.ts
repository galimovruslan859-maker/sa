/**
 * Создание схемы базы данных без CLI Prisma.
 *
 * `prisma migrate` требует нативный query-engine, который скачивается с
 * binaries.prisma.sh. В офлайн-среде этот файл применяет SQL из миграции
 * напрямую через Prisma Client (driver adapter), по одному выражению за раз.
 *
 * Запуск:  npm run db:setup        (создать схему, если её нет, и заполнить данными)
 *          npm run db:reset        (пересоздать схему с нуля и заполнить данными)
 */
import fs from 'node:fs';
import path from 'node:path';

import { disconnectPrisma, getPrisma } from '../src/config/prisma';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');

/** Разбивает SQL-миграцию на отдельные выражения. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}

function migrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(MIGRATIONS_DIR, entry.name, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .sort();
}

async function tableExists(db: Awaited<ReturnType<typeof getPrisma>>, table: string) {
  const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = '${table}'`,
  );
  return (rows[0]?.n ?? 0) > 0;
}

async function dropSchema(db: Awaited<ReturnType<typeof getPrisma>>) {
  const rows = await db.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  for (const row of rows) {
    await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`);
  }
  const types = await db.$queryRawUnsafe<Array<{ typname: string }>>(
    `SELECT t.typname FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typtype = 'e'`,
  );
  for (const type of types) {
    await db.$executeRawUnsafe(`DROP TYPE IF EXISTS "${type.typname}" CASCADE`);
  }
}

async function main() {
  const force = process.argv.includes('--force');
  const db = await getPrisma();

  const hasSchema = await tableExists(db, 'users');

  if (hasSchema && !force) {
    console.log('✔ Схема БД уже существует — пропускаю создание (db:reset пересоздаст её).');
  } else {
    if (hasSchema && force) {
      console.log('↻ Удаляю старую схему…');
      await dropSchema(db);
    }

    const files = migrationFiles();
    if (files.length === 0) throw new Error('Миграции не найдены в prisma/migrations');

    for (const file of files) {
      const statements = splitStatements(fs.readFileSync(file, 'utf8'));
      console.log(`→ Применяю ${path.basename(path.dirname(file))}: ${statements.length} выражений`);
      for (const statement of statements) {
        await db.$executeRawUnsafe(statement);
      }
    }
    console.log('✔ Схема БД создана');
  }

  await disconnectPrisma();
}

main().catch(async (err) => {
  console.error('❌ Ошибка подготовки БД:', err instanceof Error ? err.message : err);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
