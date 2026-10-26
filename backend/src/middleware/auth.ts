import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/http-error';

export interface JwtPayload {
  sub: number;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Требует валидный JWT. Кладёт пользователя в req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next(unauthorized('Требуется авторизация: токен не передан'));

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
    if (typeof decoded.sub !== 'number' || !decoded.role) {
      return next(unauthorized('Некорректный токен'));
    }
    req.user = { sub: decoded.sub, email: decoded.email, role: decoded.role };
    return next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError ? 'Срок действия токена истёк' : 'Недействительный токен';
    return next(unauthorized(message));
  }
}

/** Если токен есть и валиден — кладёт пользователя в req.user, иначе пропускает дальше. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as unknown as JwtPayload;
    if (typeof decoded.sub === 'number' && decoded.role) {
      req.user = { sub: decoded.sub, email: decoded.email, role: decoded.role };
    }
  } catch {
    // игнорируем невалидный токен для публичных маршрутов
  }
  return next();
}

/** Role-based access control: пускает только администраторов. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') {
    return next(forbidden('Раздел доступен только администратору'));
  }
  return next();
}
