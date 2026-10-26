import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { notFound } from '../utils/http-error';
import { kopecksToRubles } from '../utils/money';
import { productInclude, toAdminProduct, toPublicProduct } from './product.service';

export interface CatalogQuery {
  q?: string;
  category?: number[];
  brand?: string[];
  size?: string[];
  color?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'rating' | 'name';
  page?: number;
  limit?: number;
  includeInactive?: boolean;
  lowStock?: boolean;
}

function buildWhere(query: CatalogQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (!query.includeInactive) where.isActive = true;

  if (query.q && query.q.trim().length > 0) {
    const q = query.q.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { category: { name: { contains: q, mode: 'insensitive' } } },
    ];
  }

  if (query.category && query.category.length > 0) where.categoryId = { in: query.category };
  if (query.brand && query.brand.length > 0) {
    where.brand = { in: query.brand.map((b) => b.toLowerCase()) };
  }
  if (query.size && query.size.length > 0) where.sizes = { hasSome: query.size };
  if (query.color && query.color.length > 0) {
    where.variants = { some: { color: { in: query.color } } };
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.priceCents = {};
    if (query.minPrice !== undefined) where.priceCents.gte = Math.round(query.minPrice * 100);
    if (query.maxPrice !== undefined) where.priceCents.lte = Math.round(query.maxPrice * 100);
  }
  if (query.inStock) where.variants = { some: { stock: { gt: 0 } } };
  if (query.lowStock) {
    where.variants = { some: { stock: { gt: 0, lte: 3 } } };
  }

  return where;
}

function buildOrderBy(
  sort: CatalogQuery['sort'],
): Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return { priceCents: 'asc' };
    case 'price_desc':
      return { priceCents: 'desc' };
    case 'name':
      return { name: 'asc' };
    case 'rating':
      return [{ reviews: { _count: 'desc' } }, { createdAt: 'desc' }];
    case 'popular':
      return [{ orderItem: { _count: 'desc' } }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return { createdAt: 'desc' };
  }
}

/** Список товаров с фильтрами, поиском, сортировкой и пагинацией. */
export async function listProducts(db: PrismaClient, query: CatalogQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(96, Math.max(1, query.limit ?? 12));
  const where = buildWhere(query);

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: productInclude,
      orderBy: buildOrderBy(query.sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map((p) => toPublicProduct(p)),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Админский список товаров: с финансовой частью и количеством проданного. */
export async function listProductsAdmin(db: PrismaClient, query: CatalogQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 20));
  const where = buildWhere({ ...query, includeInactive: query.includeInactive ?? true });

  const [total, rows] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      include: productInclude,
      orderBy: buildOrderBy(query.sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const sold = await db.orderItem.groupBy({
    by: ['productId'],
    _sum: { quantity: true },
    where: { productId: { in: rows.map((r) => r.id) }, order: { status: { not: 'cancelled' } } },
  });
  const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));

  return {
    items: rows.map((p) => toAdminProduct(p, soldMap.get(p.id) ?? 0)),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Карточка товара для покупателя. */
export async function getProductPublic(db: PrismaClient, idOrSlug: string) {
  const where = Number.isFinite(Number(idOrSlug)) && idOrSlug.trim() !== ''
    ? { id: Number(idOrSlug) }
    : { slug: idOrSlug };

  const product = await db.product.findFirst({ where: where as Prisma.ProductWhereInput, include: productInclude });
  if (!product) throw notFound('Товар не найден');
  if (!product.isActive) throw notFound('Товар снят с продажи');

  return toPublicProduct(product, {
    reviews: product.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      author: `${r.user.firstName} ${r.user.lastName ?? ''}`.trim(),
    })),
    related: await relatedProducts(db, product),
  });
}

/** Карточка товара для админ-панели (с финансами). */
export async function getProductAdmin(db: PrismaClient, id: number) {
  const product = await db.product.findUnique({ where: { id }, include: productInclude });
  if (!product) throw notFound('Товар не найден');

  const soldRow = await db.orderItem.aggregate({
    where: { productId: id, order: { status: { not: 'cancelled' } } },
    _sum: { quantity: true },
  });

  return toAdminProduct(product, soldRow._sum.quantity ?? 0);
}

async function relatedProducts(db: PrismaClient, product: { id: number; categoryId: number }) {
  const rows = await db.product.findMany({
    where: { categoryId: product.categoryId, isActive: true, id: { not: product.id } },
    include: productInclude,
    take: 8,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    brand: p.brand,
    price: kopecksToRubles(p.priceCents),
    image: [...p.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]?.url ?? null,
  }));
}

/** Доступные значения фильтров (для панели фильтров в каталоге). */
export async function getFacets(db: PrismaClient) {
  const [categories, brands, priceAgg, products] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } }),
    db.product.findMany({
      where: { isActive: true, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    }),
    db.product.aggregate({ where: { isActive: true }, _min: { priceCents: true }, _max: { priceCents: true } }),
    db.product.findMany({
      where: { isActive: true },
      select: { sizes: true, variants: { select: { color: true } } },
    }),
  ]);

  const sizes = Array.from(new Set(products.flatMap((p) => p.sizes))).sort();
  const colors = Array.from(new Set(products.flatMap((p) => p.variants.map((v) => v.color)))).sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );

  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: c._count.products,
    })),
    brands: brands.map((b) => b.brand).filter((b): b is string => Boolean(b)),
    sizes,
    colors,
    price: {
      min: kopecksToRubles(priceAgg._min.priceCents ?? 0),
      max: kopecksToRubles(priceAgg._max.priceCents ?? 0),
    },
  };
}
