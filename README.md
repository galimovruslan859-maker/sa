# RESELL — интернет-магазин одежды и обуви из Китая

Курсовой проект: **полноценное fullstack-приложение** (не HTML-макет) для перепродажи одежды,
обуви и аксессуаров, закупленных у китайских поставщиков.

- **Frontend:** React 18 + TypeScript + React Router 6 + Zustand, адаптивная вёрстка
- **Backend:** Node.js + Express 4 + TypeScript, REST API, JWT-авторизация, RBAC
- **База данных:** PostgreSQL + Prisma ORM (14 связанных таблиц, нормализованная схема)
- **Деньги:** в БД хранятся в копейках (`Int`), в API и интерфейсе — в рублях

> Финансовые данные (закупочная цена, себестоимость, прибыль, маржинальность) существуют
> **только в админской части**. Публичные эндпоинты их не отдают — это проверяется автотестами.

---

## 1. Возможности

### Покупатель

| Функция | Где |
|---|---|
| Регистрация, вход, выход | `/register`, `/login`, меню профиля |
| Каталог с поиском, фильтрами (категория, бренд, размер, цвет, цена, наличие) и сортировкой | `/catalog` |
| Карточка товара: галерея, выбор цвета и размера, количество, состав, характеристики, отзывы | `/product/:id` |
| Корзина: добавление, изменение количества, удаление, очистка | `/cart` |
| Избранное | `/favorites` |
| Оформление заказа: имя, телефон, город, способ доставки, адрес или пункт выдачи, промокод, комментарий | `/checkout` |
| История заказов и статусы, отмена, повтор заказа | `/orders`, `/orders/:id` |
| Профиль: личные данные, смена пароля, мои отзывы | `/profile` |
| Отзывы и оценки — только на товары из своих заказов | карточка товара, `/profile` |

Статусы заказа: `pending` → `paid` → `processing` → `shipped` → `delivered`, плюс `cancelled`.
Покупатель может оплатить и отменить заказ, пока он в статусе `pending`.

### Администратор (`/admin`)

| Раздел | Что делает |
|---|---|
| **Обзор** | заказы, выручка, себестоимость, расходы, прибыль, средний чек, проданные единицы, график динамики, лидеры продаж, товары с низкими продажами, заканчивающиеся остатки |
| **Товары** | CRUD товаров, загрузка фотографий, редактирование остатков по вариациям, снятие/возврат в продажу, управление категориями |
| **Заказы** | просмотр всех заказов, смена статуса, детали с прибылью по каждой позиции |
| **Пользователи** | список, роли (ADMIN/CUSTOMER), блокировка |
| **Аналитика** | отчёт по каждому товару: закупка → доставка → комиссии → себестоимость → прибыль → маржинальность, структура расходов, остатки |
| **Промокоды** | процент/фикс. сумма, минимальный заказ, лимит использований, срок действия |
| **Расходы** | журнал расходов по категориям, поставщики из Китая, партии закупок |

---

## 2. Финансовая модель

```
Себестоимость   = закупочная цена + доставка из Китая + комиссия посредника
                + таможенные платежи + упаковка + комиссия платёжной системы + реклама
Прибыль         = цена продажи − себестоимость − прочие расходы
Маржинальность  = прибыль / цена продажи × 100 %
```

Пример (реальные данные из демо-базы):

```
Закупка 1 700 ₽ + Доставка 300 ₽ + Прочие 200 ₽ = Себестоимость 2 200 ₽
Продажа 4 490 ₽ − Себестоимость 2 200 ₽         = Прибыль 2 290 ₽
2 290 / 4 490 × 100                             = Маржинальность 51,0 %
```

Покупатель видит только `Цена: 4 490 ₽`.

Демо-показатели за 90 дней: выручка **313 594 ₽**, себестоимость **188 763 ₽**,
прочие расходы **84 300 ₽**, чистая прибыль **40 531 ₽**, маржинальность **12,9 %**.

---

## 3. Быстрый старт

Нужны **Node.js 20+** и npm. PostgreSQL ставить не обязательно: по умолчанию проект работает
на встроенном PostgreSQL (PGlite, WebAssembly) — данные лежат в `backend/.pgdata`.

### Вариант А — без установки PostgreSQL (рекомендуется для проверки)

```bash
# 1. backend
cd backend
npm install --legacy-peer-deps      # флаг нужен из-за peer-зависимостей адаптера PGlite
cp .env.example .env
npm run db:setup                    # создать схему БД и заполнить демо-данными
npm run dev                         # API на http://localhost:4000

# 2. frontend (в отдельном терминале)
cd frontend
npm install
npm run dev                         # сайт на http://localhost:5173
```

Откройте <http://localhost:5173>.

### Вариант Б — настоящий PostgreSQL через Docker

```bash
docker compose up -d db                          # поднимет PostgreSQL 16
cd backend
cp .env.example .env                             # в .env: DATABASE_ENGINE=pg
npm install --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy                        # применит миграцию prisma/migrations
npm run db:seed                                  # демо-данные
npm run dev
```

Либо всё сразу: `docker compose up --build` (поднимет БД, API и фронтенд).

### Вариант В — сайт и API одним процессом (один порт)

Backend умеет сам раздавать production-сборку фронтенда, поэтому всё приложение
открывается на порту API — удобно для демонстрации и деплоя без nginx:

```bash
cd frontend && npm install && npm run build      # соберёт frontend/dist
cd ../backend
npm install --legacy-peer-deps
cp .env.example .env
npm run db:setup
npm start                                        # http://localhost:4000 — и сайт, и API
```

Как это работает: `GET /` и любые маршруты вроде `/catalog`, `/admin` отдают `dist/index.html`
(дальше навигацию ведёт React Router), `/assets/*` — статику сборки с долгим кэшем,
а `/api/*` и `/uploads/*` обрабатываются как обычно. Путь к сборке задаётся переменной
`FRONTEND_DIST` (по умолчанию `../frontend/dist`); если сборки нет, backend остаётся чистым API.

### Полезные команды

| Команда | Каталог | Что делает |
|---|---|---|
| `npm run dev` | backend / frontend | запуск в режиме разработки |
| `npm run db:setup` | backend | схема + демо-данные (если БД пустая) |
| `npm run db:reset` | backend | пересоздать схему и данные с нуля |
| `npm run db:seed` | backend | только заполнение демо-данными |
| `npm run smoke` | backend | 59 проверок API (см. раздел «Тесты») |
| `npm run typecheck` | backend / frontend | проверка типов TypeScript |
| `npm run build` | frontend | production-сборка в `frontend/dist` |
| `npm run start` | backend | запуск API без watch |

---

## 4. Демо-доступ

| Роль | E-mail | Пароль |
|---|---|---|
| Администратор | `admin@resell.ru` | `admin123` |
| Покупатель | `demo@resell.ru` | `demo1234` |
| Покупатели | `anna@` / `igor@` / `maria@` / `pavel@` / `olga@example.com` | `demo1234` |

Промокоды: `RESELL10` (−10 %), `FIRST500` (−500 ₽ от 3 000 ₽), `WINTER20` (−20 % от 5 000 ₽),
`OLD2024` (неактивен).

В демо-базе: 26 товаров, 285 вариаций (размер × цвет), 10 категорий, 6 поставщиков,
23 заказа в разных статусах, 23 отзыва, партии закупок и журнал расходов.

---

## 5. Структура проекта

```
sa/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma           # 14 моделей, enum'ы, индексы, @@map в snake_case
│   │   ├── migrations/             # SQL-миграция init
│   │   └── seed.ts                 # демо-данные (товары, заказы, отзывы, закупки)
│   ├── scripts/
│   │   ├── bootstrap-db.ts         # накатывает схему без CLI Prisma (офлайн)
│   │   └── smoke-test.ts           # 59 проверок API
│   ├── src/
│   │   ├── config/                 # env, singleton Prisma Client
│   │   ├── controllers/            # auth, product, category, cart, order, favorite, review, admin, upload
│   │   ├── middleware/             # requireAuth, requireAdmin, errorHandler
│   │   ├── routes/                 # /api/* маршруты
│   │   ├── services/               # бизнес-логика и маппинг DTO
│   │   ├── utils/                  # деньги (копейки↔рубли), HttpError, validate, slug
│   │   ├── validators/schemas.ts   # Zod-схемы всех входящих данных
│   │   ├── app.ts                  # Express: helmet, CORS, rate-limit, morgan, static
│   │   └── server.ts               # точка входа
│   ├── uploads/products/           # фотографии товаров (загрузка через multer)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/             # Header, Footer, ProductCard, Modal, Rating, Toasts, BarChart, StatusBadge…
│   │   ├── layouts/                # ShopLayout, AdminLayout (защита по роли)
│   │   ├── lib/                    # useQuickAdd
│   │   ├── pages/                  # 12 страниц магазина
│   │   │   └── admin/              # 7 страниц админ-панели + ProductForm, CategoriesModal
│   │   ├── services/               # types.ts (DTO), api.ts (fetch-клиент), endpoints.ts
│   │   ├── store/                  # Zustand: auth, cart, favorite, toast
│   │   ├── styles/global.css       # дизайн-система
│   │   ├── App.tsx                 # маршруты
│   │   └── main.tsx
│   ├── vite.config.ts              # прокси /api и /uploads на backend
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

### Маршруты фронтенда

`/` · `/catalog` · `/product/:id` · `/cart` · `/checkout` · `/login` · `/register` ·
`/profile` · `/orders` · `/orders/:id` · `/favorites` · `/admin` · `/admin/products` ·
`/admin/orders` · `/admin/users` · `/admin/analytics` · `/admin/promocodes` ·
`/admin/expenses` · `404`

---

## 6. API

Базовый адрес: `http://localhost:4000/api`. Формат ошибок:

```json
{ "error": { "message": "Текст ошибки", "status": 400, "details": [{ "field": "email", "message": "…" }] } }
```

### Авторизация

| Метод | Путь | Доступ |
|---|---|---|
| POST | `/auth/register` | все |
| POST | `/auth/login` | все |
| GET | `/auth/me` | JWT |
| PUT | `/auth/me` | JWT |
| POST | `/auth/logout` | JWT |

### Каталог

| Метод | Путь | Доступ |
|---|---|---|
| GET | `/products` (q, category, brand, size, color, minPrice, maxPrice, inStock, sort, page, limit) | все |
| GET | `/products/facets` — значения фильтров | все |
| GET | `/products/new` — новинки | все |
| GET | `/products/:idOrSlug` | все |
| GET | `/products/:id/reviews` | все |
| GET | `/categories` | все |

### Корзина, заказы, избранное, отзывы

| Метод | Путь | Доступ |
|---|---|---|
| GET / POST | `/cart` | JWT |
| PUT / DELETE | `/cart/:id` | JWT |
| DELETE | `/cart` (очистить) | JWT |
| GET | `/orders/checkout-preview` (доставка + промокод) | JWT |
| POST | `/orders` | JWT |
| GET | `/orders`, `/orders/:id` | JWT (только свои) |
| PUT | `/orders/:id/status` | JWT (`pending` → `paid`/`cancelled`) |
| GET | `/orders/delivery-options` | JWT |
| GET / POST | `/favorites` | JWT |
| GET | `/favorites/ids` | JWT |
| DELETE | `/favorites/:productId` | JWT |
| POST | `/reviews` | JWT (только купленный товар, один отзыв на товар) |
| GET | `/reviews/mine` | JWT |
| DELETE | `/reviews/:id` | JWT |

### Администрирование (JWT + роль `ADMIN`)

| Метод | Путь |
|---|---|
| GET | `/admin/statistics?days=90` — заказы, финансы, динамика, лидеры, остатки |
| GET | `/admin/statistics/stock` |
| GET | `/admin/profit` — прибыль по каждому товару |
| GET / POST | `/admin/products` |
| GET / PUT / DELETE | `/admin/products/:id` |
| PUT | `/admin/products/:id/stock` (массово), `/admin/products/:id/variants/:variantId/stock` |
| GET / POST | `/admin/categories` |
| PUT / DELETE | `/admin/categories/:id` |
| GET | `/admin/orders`, `/admin/orders/:id` |
| PUT | `/admin/orders/:id/status` |
| GET | `/admin/users`; PUT `/admin/users/:id` |
| GET / POST | `/admin/promocodes`; PUT / DELETE `/admin/promocodes/:id` |
| GET / POST / DELETE | `/admin/expenses` |
| GET / POST / DELETE | `/admin/suppliers` |
| GET / POST | `/admin/purchases`; PUT `/admin/purchases/:id/status` |
| POST | `/admin/uploads/products` — загрузка фотографий (multer, до 10 файлов, 5 МБ) |
| GET | `/health` |

Доставка: пункт выдачи — 0 ₽, курьер — 490 ₽, почта — 350 ₽, бесплатно от 5 000 ₽.
Номер заказа: `RSL-YYYYMMDD-NNNN`. Артикул вариации: `CODE-COL-SIZ-NNNNN`.

---

## 7. База данных

`users` · `categories` · `products` · `product_images` · `product_variants` · `cart_items` ·
`orders` · `order_items` · `favorites` · `reviews` · `promocodes` · `promo_usages` ·
`suppliers` · `purchases` · `purchase_items` · `expenses`

Ключевые решения:

- **Вариации** `product_variants` с уникальным `sku` и `@@unique([productId, size, color])` —
  остаток хранится у вариации, а не у товара.
- **Деньги в копейках** (`priceCents`, `costCents`, `unitCostCents`…) — целые числа, без ошибок
  округления; перевод в рубли только на границе API.
- **Снимок цены и себестоимости** в `order_items` (`unitPriceCents`, `unitCostCents`) — история
  заказов не меняется, даже если товар потом подорожал.
- **`favorites`** и **`reviews`** с составными уникальными ключами — нельзя twice.
- **Каскады**: `onDelete: Cascade` для корзины/избранного/вариаций, `Restrict` там, где важна
  история (товар в заказе нельзя удалить — он снимается с продажи).

---

## 8. Безопасность

- Пароли — `bcrypt` (10 раундов), в БД только хэш
- JWT (`HS256`, срок 7 дней), секрет в `JWT_SECRET`
- RBAC: `requireAuth` + `requireAdmin`; админские маршруты недоступны покупателю (403) и гостю (401)
- Валидация всех входящих данных Zod-схемами (`src/validators/schemas.ts`)
- Параметризованные запросы Prisma — защита от SQL-инъекций
- React экранирует вывод — защита от XSS; `helmet` добавляет CSP и security-заголовки
- CORS по белому списку `CORS_ORIGIN`, `express-rate-limit` на `/api/auth`
- Загрузка файлов: белый список MIME, ограничение размера, имена генерируются сервером
- Все секреты — в переменных окружения (`.env` в `.gitignore`)
- Финансовые поля отдаются только в DTO `toAdminProduct` и на `/api/admin/*`

---

## 9. Тесты

```bash
cd backend
npm run dev                # в одном терминале
npm run smoke              # в другом
```

`scripts/smoke-test.ts` — 59 проверок реального API: регистрация и вход, валидация, каталог и
фильтры, корзина (включая коды 201/200 при повторном добавлении), расчёт доставки, промокоды,
оформление заказа, смена статусов и запрет недопустимых переходов, избранное, отзывы
(403 без покупки, 409 за дубль), админская статистика и отчёт о прибыли, права доступа.

Отдельно проверяется **утечка финансовых данных**: в публичном списке товаров, в карточке товара
и в заказах покупателя не должно быть полей `purchasePrice`, `costCents`, `unitCost`, `finance`.
Проверяется и формула прибыли: `цена − себестоимость = прибыль` (точность ±0,02).

Результат прогона: `Итого: 59 проверок пройдено, 0 провалено.`

---

## 10. Переменные окружения

См. `backend/.env.example` (копия — в корне проекта):

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `4000` | порт API |
| `DATABASE_ENGINE` | `pglite` | `pglite` (встроенная БД) или `pg` (сервер PostgreSQL) |
| `DATABASE_URL` | `postgresql://resell:resell@localhost:5432/resell` | строка подключения |
| `PGLITE_DATA_DIR` | `./.pgdata` | каталог данных встроенной БД |
| `JWT_SECRET` | — | секрет подписи токенов |
| `JWT_EXPIRES_IN` | `7d` | срок жизни токена |
| `CORS_ORIGIN` | `http://localhost:5173` | разрешённые источники (через запятую, `*` — все) |
| `UPLOAD_DIR` | `./uploads` | каталог загруженных фотографий |
| `FRONTEND_DIST` | `../frontend/dist` | сборка фронтенда: если есть, backend раздаёт сайт на своём порту |
| `DEBUG_SQL` | `false` | логировать SQL-запросы |

---

## 11. Примечания

- Сгенерированный Prisma Client (`backend/src/generated/prisma`) намеренно добавлен в репозиторий:
  он позволяет запускать проект без обращения к `binaries.prisma.sh`. В обычном проекте этот
  каталог заменяет команда `npx prisma generate`.
- `scripts/bootstrap-db.ts` применяет SQL из `prisma/migrations` через Prisma Client — это запасной
  путь для сред, где CLI Prisma не может скачать нативный движок. При работе с обычным
  PostgreSQL используйте `npx prisma migrate deploy`.
- Фотографии товаров в демо-данных — сгенерированные SVG-заглушки (`backend/uploads/products`);
  через админ-панель загружаются настоящие фото (jpg, png, webp, gif, svg).
