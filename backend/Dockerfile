# ---------------------------------------------------------------------------
# RESELL backend — Node.js 22 + Express + Prisma + PostgreSQL
# ---------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Зависимости (включая dev: prisma CLI и tsx нужны для миграций и запуска)
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# Исходники
COPY tsconfig.json prisma.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY uploads ./uploads
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=4000 \
    UPLOAD_DIR=/app/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
  CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
