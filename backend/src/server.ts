import { createApp } from './app';
import { env } from './config/env';
import { disconnectPrisma, getPrisma } from './config/prisma';

async function bootstrap(): Promise<void> {
  // Проверяем соединение с базой данных до приёма запросов
  const db = await getPrisma();
  const users = await db.user.count();

  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`⚡ RESELL API запущен: http://localhost:${env.PORT}/api`);
    // eslint-disable-next-line no-console
    console.log(`   База данных: PostgreSQL (${env.DATABASE_ENGINE}), пользователей в БД: ${users}`);
    if (users === 0) {
      // eslint-disable-next-line no-console
      console.log('   База пустая — выполните `npm run db:seed` для загрузки демо-данных');
    }
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`\n${signal}: останавливаю сервер...`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});
