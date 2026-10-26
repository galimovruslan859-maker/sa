import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { badRequest, notFound } from '../utils/http-error';
import { productInclude, toPublicProduct } from '../services/product.service';

/** GET /api/favorites — список избранных товаров. */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.favorite.findMany({
    where: { userId: req.user!.sub },
    include: { product: { include: productInclude } },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    items: rows.map((r) => ({
      ...toPublicProduct(r.product),
      addedAt: r.createdAt,
    })),
    total: rows.length,
  });
});

/** POST /api/favorites — добавить товар в избранное (toggle). */
export const toggle = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const productId = Number(req.body?.productId ?? req.params.productId);
  if (!Number.isFinite(productId) || productId <= 0) throw badRequest('Некорректный productId');

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw notFound('Товар не найден');

  const existing = await db.favorite.findUnique({
    where: { userId_productId: { userId: req.user!.sub, productId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    res.json({ favorite: false, productId });
    return;
  }

  await db.favorite.create({ data: { userId: req.user!.sub, productId } });
  res.status(201).json({ favorite: true, productId });
});

/** DELETE /api/favorites/:productId — убрать из избранного. */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId)) throw badRequest('Некорректный productId');

  await db.favorite.deleteMany({ where: { userId: req.user!.sub, productId } });
  res.json({ favorite: false, productId });
});

/** GET /api/favorites/ids — идентификаторы избранных товаров (для иконок-сердечек). */
export const ids = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.favorite.findMany({
    where: { userId: req.user!.sub },
    select: { productId: true },
  });
  res.json({ ids: rows.map((r) => r.productId) });
});
