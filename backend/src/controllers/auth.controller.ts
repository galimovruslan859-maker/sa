import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../config/prisma';
import { signToken } from '../middleware/auth';
import { asyncHandler } from '../utils/async-handler';
import { conflict, notFound, unauthorized } from '../utils/http-error';
import { validateBody } from '../utils/validate';
import { loginSchema, registerSchema, updateProfileSchema } from '../validators/schemas';

const SALT_ROUNDS = 10;

export interface PublicUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  isActive: boolean;
  createdAt: Date;
}

export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

/** POST /api/auth/register — регистрация покупателя. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(registerSchema, req.body);

  const exists = await db.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict('Пользователь с таким e-mail уже зарегистрирован');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await db.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName || null,
      phone: input.phone || null,
      role: 'CUSTOMER',
    },
  });

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.status(201).json({ token, user: toPublicUser(user) });
});

/** POST /api/auth/login — вход по e-mail и паролю. */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(loginSchema, req.body);

  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized('Неверный e-mail или пароль');
  if (!user.isActive) throw unauthorized('Аккаунт заблокирован');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw unauthorized('Неверный e-mail или пароль');

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.json({ token, user: toPublicUser(user) });
});

/** GET /api/auth/me — текущий пользователь + краткая статистика. */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const user = await db.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw notFound('Пользователь не найден');

  const [ordersCount, favoritesCount, reviewsCount, cartCount] = await Promise.all([
    db.order.count({ where: { userId: user.id } }),
    db.favorite.count({ where: { userId: user.id } }),
    db.review.count({ where: { userId: user.id } }),
    db.cartItem.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }),
  ]);

  res.json({
    user: toPublicUser(user),
    stats: {
      ordersCount,
      favoritesCount,
      reviewsCount,
      cartCount: cartCount._sum.quantity ?? 0,
    },
  });
});

/** PUT /api/auth/me — редактирование профиля и смена пароля. */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(updateProfileSchema, req.body);

  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName || null;
  if (input.phone !== undefined) data.phone = input.phone || null;
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await db.user.update({ where: { id: req.user!.sub }, data });
  res.json({ user: toPublicUser(user) });
});

/** POST /api/auth/logout — подтверждение выхода (токен удаляется на клиенте). */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Вы вышли из аккаунта' });
});
