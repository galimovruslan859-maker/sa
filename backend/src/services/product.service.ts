import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { notFound } from '../utils/http-error';
import { kopecksToRubles, marginPercent, unitCost, unitProfit } from '../utils/money';
import { slugify, uniqueSlug } from '../utils/slug';
import { rublesToKopecks } from '../utils/money';

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    supplier: true;
    images: true;
    variants: true;
    reviews: { include: { user: true } };
  };
}>;

/** Публичное представление товара — БЕЗ закупочных цен и прочих финансов. */
export function toPublicProduct(p: ProductWithRelations, extra: Record<string, unknown> = {}) {
  const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
  const ratingSum = p.reviews.reduce((sum, r) => sum + r.rating, 0);
  const rating = p.reviews.length ? Math.round((ratingSum / p.reviews.length) * 10) / 10 : 0;

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    brand: p.brand,
    category: { id: p.category.id, name: p.category.name, slug: p.category.slug },
    composition: p.composition,
    specs: (p.specs ?? {}) as Record<string, string>,
    sizes: p.sizes,
    colors: (p.colors ?? []) as Array<{ name: string; hex?: string }>,
    price: kopecksToRubles(p.priceCents),
    priceCents: p.priceCents,
    inStock: totalStock > 0,
    totalStock,
    rating,
    reviewsCount: p.reviews.length,
    images: [...p.images]
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
      .map((img) => ({ id: img.id, url: img.url, alt: img.alt, isPrimary: img.isPrimary })),
    variants: p.variants.map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      sku: v.sku,
      stock: v.stock,
    })),
    isActive: p.isActive,
    createdAt: p.createdAt,
    ...extra,
  };
}

/**
 * Административное представление товара: добавляется финансовая модель.
 * Используется ТОЛЬКО в маршрутах /api/admin/*.
 */
export function toAdminProduct(p: ProductWithRelations, soldUnits = 0) {
  const base = toPublicProduct(p);
  const costCents = unitCost(p);
  const profitCents = unitProfit(p);

  return {
    ...base,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
    finance: {
      purchasePrice: kopecksToRubles(p.purchasePriceCents),
      deliveryCost: kopecksToRubles(p.deliveryCostCents),
      commission: kopecksToRubles(p.commissionCents),
      customs: kopecksToRubles(p.customsCents),
      packaging: kopecksToRubles(p.packagingCents),
      paymentFee: kopecksToRubles(p.paymentFeeCents),
      advertising: kopecksToRubles(p.advertisingCents),
      cost: kopecksToRubles(costCents),
      price: kopecksToRubles(p.priceCents),
      profit: kopecksToRubles(profitCents),
      margin: marginPercent(profitCents, p.priceCents),
      soldUnits,
      totalProfit: kopecksToRubles(profitCents * soldUnits),
    },
    financeCents: {
      purchasePriceCents: p.purchasePriceCents,
      deliveryCostCents: p.deliveryCostCents,
      commissionCents: p.commissionCents,
      customsCents: p.customsCents,
      packagingCents: p.packagingCents,
      paymentFeeCents: p.paymentFeeCents,
      advertisingCents: p.advertisingCents,
      costCents,
      profitCents,
    },
  };
}

export const productInclude = {
  category: true,
  supplier: true,
  images: true,
  variants: true,
  reviews: { include: { user: true }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.ProductInclude;

type CreateProductInput = {
  name: string;
  slug?: string;
  description?: string;
  brand?: string;
  categoryId: number;
  supplierId?: number | null;
  composition?: string;
  specs?: Record<string, string>;
  sizes: string[];
  colors: Array<{ name: string; hex?: string }>;
  price: number;
  finance?: Partial<{
    purchasePrice: number;
    deliveryCost: number;
    commission: number;
    customs: number;
    packaging: number;
    paymentFee: number;
    advertising: number;
  }>;
  images?: Array<{ url: string; alt?: string }>;
  variants?: Array<{ size: string; color: string; stock: number }>;
  isActive?: boolean;
};

/** Короткий код из slug для артикула. */
function skuCode(input: string): string {
  const code = slugify(input).replace(/[^a-z0-9]/g, '');
  return (code.slice(0, 4) || 'ITEM').toUpperCase();
}

/**
 * Строит список вариаций: из явного списка либо как произведение размеров и цветов.
 * `startSeq` гарантирует уникальность артикулов в пределах БД.
 */
function buildVariants(input: CreateProductInput, slug: string, startSeq: number) {
  const makeSku = (color: string, size: string, seq: number) =>
    `${skuCode(slug)}-${skuCode(color)}-${skuCode(size)}-${String(seq).padStart(5, '0')}`;

  if (input.variants && input.variants.length > 0) {
    return input.variants.map((v, i) => ({
      size: v.size,
      color: v.color,
      stock: v.stock,
      sku: makeSku(v.color, v.size, startSeq + i),
    }));
  }
  const result: Array<{ size: string; color: string; stock: number; sku: string }> = [];
  let i = 0;
  for (const color of input.colors) {
    for (const size of input.sizes) {
      result.push({ size, color: color.name, stock: 0, sku: makeSku(color.name, size, startSeq + i) });
      i += 1;
    }
  }
  return result;
}

/** Следующий свободный номер для артикулов. */
async function nextSkuSequence(db: PrismaClient): Promise<number> {
  const rows = await db.productVariant.findMany({ select: { sku: true }, orderBy: { sku: 'desc' }, take: 1 });
  const last = rows[0]?.sku.match(/(\d+)$/);
  return last ? Number(last[1]) + 1 : 1;
}

function financeToCents(finance: CreateProductInput['finance']) {
  const f = finance ?? {};
  return {
    purchasePriceCents: rublesToKopecks(f.purchasePrice ?? 0),
    deliveryCostCents: rublesToKopecks(f.deliveryCost ?? 0),
    commissionCents: rublesToKopecks(f.commission ?? 0),
    customsCents: rublesToKopecks(f.customs ?? 0),
    packagingCents: rublesToKopecks(f.packaging ?? 0),
    paymentFeeCents: rublesToKopecks(f.paymentFee ?? 0),
    advertisingCents: rublesToKopecks(f.advertising ?? 0),
  };
}

export async function createProduct(db: PrismaClient, input: CreateProductInput) {
  const slug = await uniqueSlug(input.slug || input.name, async (s) =>
    db.product.findUnique({ where: { slug: s }, select: { id: true } }).then(Boolean),
  );

  const variants = buildVariants(input, slug, await nextSkuSequence(db));
  const seen = new Set<string>();
  const deduped = variants.filter((v) => {
    const key = `${v.size}|${v.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return db.product.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      brand: input.brand || null,
      categoryId: input.categoryId,
      supplierId: input.supplierId ?? null,
      composition: input.composition || null,
      specs: (input.specs ?? {}) as Prisma.InputJsonValue,
      sizes: input.sizes,
      colors: (input.colors ?? []) as unknown as Prisma.InputJsonValue,
      priceCents: rublesToKopecks(input.price),
      ...financeToCents(input.finance),
      isActive: input.isActive ?? true,
      images: {
        create: (input.images ?? []).map((img, i) => ({
          url: img.url,
          alt: img.alt ?? input.name,
          sortOrder: i,
          isPrimary: i === 0,
        })),
      },
      variants: { create: deduped },
    },
    include: productInclude,
  });
}

export async function updateProduct(db: PrismaClient, id: number, input: Partial<CreateProductInput>) {
  const existing = await db.product.findUnique({ where: { id }, include: { variants: true } });
  if (!existing) throw notFound('Товар не найден');

  const data: Prisma.ProductUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.brand !== undefined) data.brand = input.brand || null;
  if (input.composition !== undefined) data.composition = input.composition || null;
  if (input.specs !== undefined) data.specs = input.specs as Prisma.InputJsonValue;
  if (input.sizes !== undefined) data.sizes = input.sizes;
  if (input.colors !== undefined) data.colors = input.colors as unknown as Prisma.InputJsonValue;
  if (input.price !== undefined) data.priceCents = rublesToKopecks(input.price);
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
  if (input.supplierId !== undefined) {
    data.supplier = input.supplierId ? { connect: { id: input.supplierId } } : { disconnect: true };
  }
  if (input.finance !== undefined) Object.assign(data, financeToCents(input.finance));

  if (input.slug !== undefined && slugify(input.slug) !== existing.slug) {
    data.slug = await uniqueSlug(input.slug, async (s) =>
      db.product.findUnique({ where: { slug: s }, select: { id: true } }).then((r) => Boolean(r && r.id !== id)),
    );
  }

  if (input.images !== undefined) {
    data.images = {
      deleteMany: {},
      create: input.images.map((img, i) => ({
        url: img.url,
        alt: img.alt ?? input.name ?? existing.name,
        sortOrder: i,
        isPrimary: i === 0,
      })),
    };
  }

  const updated = await db.product.update({ where: { id }, data, include: productInclude });

  // Синхронизация вариаций (размер/цвет/остатки)
  if (input.sizes !== undefined || input.colors !== undefined || input.variants !== undefined) {
    const target = buildVariants(
      {
        ...input,
        name: input.name ?? existing.name,
        sizes: input.sizes ?? existing.sizes,
        colors: input.colors ?? ((existing.colors ?? []) as Array<{ name: string; hex?: string }>),
        price: input.price ?? kopecksToRubles(existing.priceCents),
        categoryId: input.categoryId ?? existing.categoryId,
      } as CreateProductInput,
      updated.slug,
      existing.variants.length + 1,
    );

    const stockMap = new Map(existing.variants.map((v) => [`${v.size}|${v.color}`, v.stock]));

    // 1. Создаём/обновляем нужные вариации (остатки сохраняются)
    await db.$transaction(
      target.map((v) =>
        db.productVariant.upsert({
          where: { productId_size_color: { productId: id, size: v.size, color: v.color } },
          update: { stock: stockMap.get(`${v.size}|${v.color}`) ?? v.stock, sku: v.sku },
          create: {
            productId: id,
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: stockMap.get(`${v.size}|${v.color}`) ?? v.stock,
          },
        }),
      ),
    );

    // 2. Удаляем вариации, которых больше нет в списке размеров/цветов
    const allowed = new Set(target.map((v) => `${v.size}|${v.color}`));
    const toDelete = existing.variants.filter((v) => !allowed.has(`${v.size}|${v.color}`));
    if (toDelete.length > 0) {
      await db.productVariant.deleteMany({ where: { id: { in: toDelete.map((v) => v.id) } } });
    }
  }

  return db.product.findUniqueOrThrow({ where: { id }, include: productInclude });
}

export async function deleteProduct(db: PrismaClient, id: number): Promise<void> {
  const existing = await db.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw notFound('Товар не найден');

  const ordered = await db.orderItem.count({ where: { productId: id } });
  if (ordered > 0) {
    // Товар участвует в истории заказов — снимаем с продажи вместо удаления,
    // чтобы не разрушать финансовую аналитику и историю заказов.
    await db.product.update({ where: { id }, data: { isActive: false } });
    return;
  }
  await db.product.delete({ where: { id } });
}

// Админские функции каталога живут в catalog.service (импортируются контроллерами отсюда)
export { getProductAdmin, listProductsAdmin } from './catalog.service';
