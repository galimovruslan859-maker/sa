import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { badRequest, conflict, forbidden, notFound } from '../utils/http-error';
import { validateBody } from '../utils/validate';
import { reviewSchema } from '../validators/schemas';

/**
 * POST /api/reviews — оставить отзыв о товаре.
 * Отзыв может оставить только покупатель, который заказывал этот товар
 * (заказ не отменён). Один отзыв на товар от одного пользователя.
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const userId = req.user!.sub;
  const body = validateBody(reviewSchema, req.body);
  const productId = Number(req.body?.productId);

  if (!Number.isFinite(productId) || productId <= 0) throw badRequest('Некорректный productId');

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
  if (!product) throw notFound('Товар не найден');

  const purchased = await db.orderItem.findFirst({
    where: {
      productId,
      order: { userId, status: { in: ['paid', 'processing', 'shipped', 'delivered'] } },
    },
    select: { id: true },
  });
  if (!purchased) {
    throw forbidden('Оставлять отзывы могут только покупатели, заказавшие этот товар');
  }

  const existing = await db.review.findUnique({
    where: { productId_userId: { productId, userId } },
  });
  if (existing) throw conflict('Вы уже оставили отзыв об этом товаре');

  const review = await db.review.create({
    data: {
      productId,
      userId,
      rating: body.rating,
      title: body.title || null,
      body: body.body || null,
    },
    include: { user: { select: { firstName: true, lastName: true } } },
  });

  const stats = await db.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { _all: true },
  });

  res.status(201).json({
    review: {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      createdAt: review.createdAt,
      author: `${review.user.firstName} ${review.user.lastName ?? ''}`.trim(),
    },
    productRating: stats._avg.rating ? Math.round(stats._avg.rating * 10) / 10 : 0,
    reviewsCount: stats._count._all,
  });
});

/** GET /api/reviews/mine — мои отзывы. */
export const mine = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.review.findMany({
    where: { userId: req.user!.sub },
    include: { product: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      product: r.product,
    })),
    total: rows.length,
  });
});

/** DELETE /api/reviews/:id — удалить свой отзыв (или любой — администратору). */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const review = await db.review.findUnique({ where: { id } });
  if (!review) throw notFound('Отзыв не найден');
  if (review.userId !== req.user!.sub && req.user!.role !== 'ADMIN') {
    throw forbidden('Можно удалять только свои отзывы');
  }
  await db.review.delete({ where: { id } });
  res.json({ success: true });
});
