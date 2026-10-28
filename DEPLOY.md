# Деплой RESELL — как разместить, чтобы всё работало

Коротко о главном:

| Площадка | Что умеет | Подходит для RESELL? |
|---|---|---|
| **GitHub** | хранит код, CI (Actions) | ❌ запустить сайт нельзя (Pages отдаёт только статику без Node и БД) |
| **Vercel / Netlify / GitHub Pages** | статика (HTML/JS/CSS) | ⚠️ только фронтенд; API и база должны жить отдельно |
| **VPS (Timeweb, Selectel, Reg.ru, любой Ubuntu-сервер)** | полноценный Node + Docker | ✅ **всё приложение на одном сервере и одном домене** |
| **Render / Railway / Fly.io** | Node-процессы | ✅ backend; база — Neon / Supabase |

Поэтому «закинуть файлы на хостинг, чтобы всё работало» имеет два рабочих сценария:
**Вариант 1** — один сервер с Docker (проще всего и всё сразу),
**Вариант 2** — фронтенд на Vercel + API на Render + PostgreSQL на Neon.
**Вариант 3** — архив руками на свой сервер без Docker.

---

## Вариант 1 — VPS + Docker (рекомендуется)

Подойдёт любой тариф с Ubuntu 22.04+ и 1 ГБ RAM (Timeweb Cloud, Selectel, Reg.ru, VK Cloud,
Hetzner…). Docker поднимает три контейнера: PostgreSQL 16, API, nginx со сборкой фронтенда.

```bash
# 1. На сервере: ставим git и docker
sudo apt update
sudo apt install -y git docker.io docker-compose-v2 || sudo apt install -y git docker.io docker-compose-plugin

# 2. Скачиваем проект
git clone https://github.com/galimovruslan859-maker/sa.git
cd sa
git checkout arena/d698d2b7-sa        # ветка с проектом (после мерджа — main)

# 3. Настройки (секрет JWT и т.п.)
cp .env.example .env
nano .env                             # смените JWT_SECRET на длинную случайную строку

# 4. Поднимаем всё одной командой (первый запуск ~3–5 минут)
sudo docker compose up -d --build
```

Готово:

- сайт: `http://IP-СЕРВЕРА:8080`
- API: `http://IP-СЕРВЕРА:4000/api/health`
- база: `localhost:5432` внутри сети compose

При первом старте контейнер backend сам применит миграции и (если `SEED_ON_START=true`)
заполнит пустую базу демо-данными. Для боевого режима поставьте `SEED_ON_START=false`.

### Свой домен и HTTPS

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
#   resell.example.ru {
#     reverse_proxy localhost:8080
#   }
sudo systemctl reload caddy
```

Caddy сам выпустит Let's Encrypt-сертификат. В `.env` backend добавьте домен в `CORS_ORIGIN`.

---

## Вариант 2 — Vercel (фронтенд) + Render (API) + Neon (PostgreSQL)

Бесплатный путь без своего сервера. Три части живут отдельно, но для браузера выглядят
как один сайт: Vercel проксирует `/api/*` и `/uploads/*` на Render через `frontend/vercel.json`.

### Шаг 1. База данных — Neon (или Supabase)

1. neon.tech → Create Project → регион `Europe (Frankfurt)`.
2. Скопируйте connection string: `postgresql://user:pass@ep-….neon.tech/neondb?sslmode=require`.

### Шаг 2. API — Render

1. render.com → **New → Web Service** → подключить ваш репозиторий.
2. Настройки:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --legacy-peer-deps`
   - **Start Command:** `sh -c "npx prisma migrate deploy && npm run db:seed:if-empty && npm run start"`
   - **Instance:** Free
3. Environment variables:
   - `DATABASE_ENGINE=pg`
   - `DATABASE_URL=<строка из Neon>`
   - `JWT_SECRET=<длинная случайная строка>`
   - `CORS_ORIGIN=https://ВАШ-ПРОЕКТ.vercel.app`
   - `NODE_ENV=production`
4. После деплоя проверьте: `https://ВАШ-API.onrender.com/api/health`.

> Бесплатный инстанс Render засыпает без запросов — первый запрос после простоя может
> отвечать ~30 секунд. Это нормально для учебного проекта.

### Шаг 3. Фронтенд — Vercel

1. vercel.com → **Add New… → Project** → тот же репозиторий.
2. Настройки: **Framework Preset:** Vite, **Root Directory:** `frontend`,
   Build `npm run build`, Output `dist` (Vercel подставит сам).
3. Откройте `frontend/vercel.json` в своей копии репозитория и замените
   `https://ВАШ-BACKEND.onrender.com` на адрес API из шага 2 (два места).
4. Deploy. Сайт: `https://ВАШ-ПРОЕКТ.vercel.app`.

Код фронтенда менять не нужно: он обращается к `/api/...` и `/uploads/...`, а Vercel
прозрачно проксирует эти пути на Render (см. `rewrites` в `vercel.json`).

---

## Вариант 3 — скачать архив и разложить руками

### Где взять файлы

- **GitHub → Releases**: https://github.com/galimovruslan859-maker/sa/releases —
  архив `resell-v1.0.0.zip` (проект **включая готовую сборку `frontend/dist`**).
- Или **Code → Download ZIP** (без `dist`: сборку придётся сделать самому).
- Или `git clone` + `git checkout arena/d698d2b7-sa`.

### 3а. Сервер с Node.js, но без Docker

```bash
# распакуйте архив, например в /opt/resell
cd resell/backend
npm install --legacy-peer-deps
cp .env.example .env                 # поправьте JWT_SECRET, CORS_ORIGIN
npm run db:setup                     # схема + демо-данные (PGlite, папка .pgdata)
npm install -g pm2
pm2 start npm --name resell -- start # API + сайт на :4000
pm2 save && pm2 startup              # автозапуск после перезагрузки

cd ../frontend
npm install
npm run build                        # backend сам раздаст dist на том же порту
```

Открывать: `http://IP:4000` — backend раздаёт и сайт, и API (переменная `FRONTEND_DIST`).
Перед nginx/caddy ставите `proxy_pass http://127.0.0.1:4000;` — и домен с HTTPS готов.

Хотите настоящий PostgreSQL вместо встроенного: в `.env` поставьте
`DATABASE_ENGINE=pg` и `DATABASE_URL=…`, затем `npx prisma migrate deploy && npm run db:seed`.

### 3б. Обычный shared-хостинг (только PHP/статика, без Node)

⚠️ Backend на таком хостинге **не запустится** — там нет Node.js и нельзя держать процесс.
Что можно сделать:

1. Залить содержимое `frontend/dist/*` в `public_html` — сайт откроется, но все кнопки,
   корзина и вход упрутся в недоступный API.
2. Чтобы это имело смысл, API должен работать где-то ещё (Вариант 2), а хостинг уметь
   проксировать `/api/*` (на shared-хостинге обычно нельзя).

**Вывод:** для «всё в одном месте» берите минимальный VPS (~200–300 ₽/мес) — это Вариант 1
или 3а. Shared-хостинг подходит только как статическая витрина без функций магазина.

---

## Чек-лист после деплоя

1. `GET https://ВАШ-ДОМЕН/api/health` → `{"status":"ok", …}`
2. Открывается главная, видны категории и карточки товаров (фото из `/uploads/…`).
3. Вход `admin@resell.ru / admin123` → открывается `/admin` с цифрами.
4. Вход `demo@resell.ru / demo1234` → корзина, оформление заказа создают настоящий заказ.
5. В админке «Заказы» виден новый заказ, статус можно менять.
6. HTTPS-сертификат активен, в консоли браузера нет ошибок CORS.

## Чего делать не стоит

- **GitHub Pages / Vercel без backend** — интерфейс отрисуется, но любые действия
  (вход, корзина) упадут: API недоступен. «Мёртвые кнопки» вместо магазина.
- **PGlite на serverless-функциях** (Vercel Functions, Lambda): встроенная БД живёт
  внутри процесса и не переживает перезапуск контейнера. Там используйте только
  `DATABASE_ENGINE=pg` с внешней базой (Neon/Supabase).
- **Коммитить `.env` и `.pgdata`** — секреты и данные базы не должны попадать в репозиторий
  (они уже в `.gitignore`).
