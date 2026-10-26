import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './http-error';

/**
 * Проверяет данные запроса zod-схемой.
 * При ошибке выбрасывает HttpError(400) со списком проблемных полей.
 */
export function validate<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
    throw badRequest('Ошибка валидации данных', fields);
  }
  return result.data;
}

/** Проверяет тело запроса и записывает результат обратно в req.body. */
export function validateBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  return validate(schema, body ?? {});
}
