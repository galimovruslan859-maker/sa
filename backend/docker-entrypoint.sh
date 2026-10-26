#!/bin/sh
# ---------------------------------------------------------------------------
# Входная точка контейнера backend:
#   1. применяет миграции Prisma
#   2. при SEED_ON_START=true заполняет пустую базу демо-данными
#   3. запускает API
# ---------------------------------------------------------------------------
set -e

echo "→ Применяю миграции Prisma…"
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "→ Проверяю, нужны ли демо-данные…"
  npm run db:seed:if-empty
fi

echo "→ Запускаю RESELL API на порту ${PORT:-4000}…"
exec npm run start
