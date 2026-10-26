import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { HttpError } from '../utils/http-error';
import { describeError } from '../utils/log-error';
import { env } from '../config/env';

/** 404 для несуществующих маршрутов API. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { message: `Маршрут ${req.method} ${req.originalUrl} не найден`, status: 404 },
  });
}

/** Централизованный обработчик ошибок: единый формат ответа { error: { ... } }. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { message: err.message, status: err.status, details: err.details },
    });
    return;
  }

  // Ошибки Prisma -> понятные HTTP-коды
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          message: 'Запись с таким уникальным значением уже существует',
          status: 409,
          details: { target: err.meta?.target },
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Запись не найдена', status: 404 } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: { message: 'Нарушена связь между таблицами (внешний ключ)', status: 400 },
      });
      return;
    }
    if (err.code === 'P2011') {
      res.status(400).json({
        error: { message: 'Не заполнено обязательное поле', status: 400, details: err.meta },
      });
      return;
    }
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { message: 'Некорректный JSON в теле запроса', status: 400 } });
    return;
  }

  const message = err instanceof Error ? err.message : 'Внутренняя ошибка сервера';
  // eslint-disable-next-line no-console
  console.error('[error]', describeError(err));
  res.status(500).json({
    error: {
      message: env.isProduction ? 'Внутренняя ошибка сервера' : message,
      status: 500,
    },
  });
}
