import { Prisma } from '../generated/prisma/client';
import { HttpError } from './http-error';

/**
 * Prisma печатает в сообщении об ошибке фрагменты минифицированного кода
 * рантайма — для логов это бесполезный шум на сотни килобайт.
 * Функция возвращает короткое человекочитаемое описание.
 */
export function describeError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta ? ` meta=${JSON.stringify(err.meta)}` : '';
    return `Prisma ${err.code}:${meta} ${shortLines(err.message)}`;
  }
  if (err instanceof HttpError) return `HTTP ${err.status}: ${err.message}`;
  if (err instanceof Error) {
    const first = (err.stack ?? err.message).split('\n').slice(0, 6).join('\n');
    return shortLines(first);
  }
  return String(err);
}

/** Оставляет только короткие (осмысленные) строки сообщения. */
function shortLines(message: string): string {
  return message
    .split('\n')
    .filter((line) => line.length < 300)
    .join('\n')
    .trim();
}
