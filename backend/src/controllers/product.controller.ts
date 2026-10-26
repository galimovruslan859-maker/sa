import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { validate } from '../utils/validate';
import { productQuerySchema } from '../validators/schemas';
import { getFacets, getProductPublic, listProducts } from '../services/catalog.service';
import { productInclude, toPublicProduct } from '../services/product.service';

/** GET /api/products — каталог с поиском, фильтрами, сортировкой и пагинацией. */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const query = validate(productQuerySchema, req.query);
  const result = await listProducts(db, query);
  res.json(result);
});

/** GET /api/products/facets — значения фильтров (категории, бренды, размеры, цвета, цены). */
export const facets = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  res.json(await getFacets(db));
});

/** GET /api/products/:id — карточка товара (id или slug) + отзывы + похожие товары. */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const product = await getProductPublic(db, String(req.params.id));
  res.json(product);
});

/** GET /api/products/:id/reviews — отзывы о товаре. */
export const reviews = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const product = await db.product.findUnique({
    where: Number.isFinite(id) ? { id } : { slug: String(req.params.id) },
    include: {
      reviews: {
        include: { user: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!product) {
    res.status(404).json({ error: { message: 'Товар не найден', status: 404 } });
    return;
  }

  const rating = product.reviews.length
    ? Math.round((product.reviews.reduce((s, r) => s + r.rating, 0) / product.reviews.length) * 10) / 10
    : 0;

  res.json({
    productId: product.id,
    rating,
    count: product.reviews.length,
    distribution: [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: product.reviews.filter((r) => r.rating === star).length,
    })),
    items: product.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      author: `${r.user.firstName} ${r.user.lastName ?? ''}`.trim(),
    })),
  });
});

/** GET /api/products/new — новинки для главной страницы. */
export const newest = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const take = Math.min(12, Math.max(1, Number(req.query.limit) || 8));
  const products = await db.product.findMany({
    where: { isActive: true },
    include: productInclude,
    orderBy: { createdAt: 'desc' },
    take,
  });
  res.json({ items: products.map((p) => toPublicProduct(p)) });
});
