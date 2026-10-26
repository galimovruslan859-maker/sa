import type { PrismaClient } from '../generated/prisma/client';
import { badRequest, notFound } from '../utils/http-error';
import { kopecksToRubles, unitCost } from '../utils/money';

const cartInclude = {
  variant: {
    include: {
      product: {
        include: { category: true, images: { where: { isPrimary: true } } },
      },
    },
  },
} as const;

export type CartRow = Awaited<ReturnType<typeof getCart>>['items'][number];

/** Корзина пользователя + итоги (себестоимость в ответ не попадает). */
export async function getCart(db: PrismaClient, userId: number) {
  const rows = await db.cartItem.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: { createdAt: 'desc' },
  });

  const items = rows.map((row) => {
    const product = row.variant.product;
    const stock = row.variant.stock;
    const lineTotalCents = product.priceCents * row.quantity;
    return {
      id: row.id,
      variantId: row.variantId,
      productId: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      size: row.variant.size,
      color: row.variant.color,
      sku: row.variant.sku,
      image: product.images[0]?.url ?? null,
      unitPrice: kopecksToRubles(product.priceCents),
      quantity: row.quantity,
      available: stock,
      lineTotal: kopecksToRubles(lineTotalCents),
      lineTotalCents,
      isActive: product.isActive,
    };
  });

  const itemsTotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);

  return {
    items,
    count: items.reduce((sum, i) => sum + i.quantity, 0),
    itemsTotal: kopecksToRubles(itemsTotalCents),
    itemsTotalCents,
  };
}

export async function addToCart(db: PrismaClient, userId: number, variantId: number, quantity: number) {
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });
  if (!variant) throw notFound('Вариация товара не найдена');
  if (!variant.product.isActive) throw badRequest('Товар снят с продажи');

  const existing = await db.cartItem.findUnique({
    where: { userId_variantId: { userId, variantId } },
  });

  const wanted = (existing?.quantity ?? 0) + quantity;
  if (wanted > variant.stock) {
    throw badRequest(
      `Недостаточно товара на складе: доступно ${variant.stock} шт. (в корзине ${existing?.quantity ?? 0})`,
      { available: variant.stock },
    );
  }

  const created = !existing;
  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity: wanted } });
  } else {
    await db.cartItem.create({ data: { userId, variantId, quantity } });
  }

  return { ...(await getCart(db, userId)), created };
}

export async function updateCartItem(db: PrismaClient, userId: number, itemId: number, quantity: number) {
  const item = await db.cartItem.findFirst({
    where: { id: itemId, userId },
    include: { variant: true },
  });
  if (!item) throw notFound('Позиция корзины не найдена');

  if (quantity > item.variant.stock) {
    throw badRequest(`Недостаточно товара на складе: доступно ${item.variant.stock} шт.`, {
      available: item.variant.stock,
    });
  }

  await db.cartItem.update({ where: { id: itemId }, data: { quantity } });
  return getCart(db, userId);
}

export async function removeCartItem(db: PrismaClient, userId: number, itemId: number) {
  const item = await db.cartItem.findFirst({ where: { id: itemId, userId }, select: { id: true } });
  if (!item) throw notFound('Позиция корзины не найдена');
  await db.cartItem.delete({ where: { id: itemId } });
  return getCart(db, userId);
}

export async function clearCart(db: PrismaClient, userId: number) {
  await db.cartItem.deleteMany({ where: { userId } });
  return getCart(db, userId);
}

/**
 * Стоимость доставки в копейках в зависимости от способа и суммы заказа.
 * Бесплатно: самовывоз всегда, курьер/почта при заказе от 5 000 ₽.
 */
export function deliveryCostCents(method: 'pickup' | 'courier' | 'post', itemsTotalCents: number): number {
  const freeFrom = 500_000; // 5 000 ₽ в копейках
  if (method === 'pickup') return 0;
  if (itemsTotalCents >= freeFrom) return 0;
  return method === 'courier' ? 49_000 : 35_000; // 490 ₽ / 350 ₽
}

export const DELIVERY_OPTIONS = [
  { id: 'pickup' as const, name: 'Пункт выдачи (СДЭК)', priceCents: 0, days: '2–4 дня' },
  { id: 'courier' as const, name: 'Курьер до двери', priceCents: 49_000, days: '1–3 дня', freeFromCents: 500_000 },
  { id: 'post' as const, name: 'Почта России', priceCents: 35_000, days: '5–10 дней', freeFromCents: 500_000 },
];

export function describeDelivery(itemsTotalCents: number) {
  return DELIVERY_OPTIONS.map((o) => ({
    id: o.id,
    name: o.name,
    days: o.days,
    freeFrom: o.freeFromCents ? kopecksToRubles(o.freeFromCents) : null,
    price: kopecksToRubles(deliveryCostCents(o.id, itemsTotalCents)),
    priceCents: deliveryCostCents(o.id, itemsTotalCents),
  }));
}

/** Проверка доступности всех позиций корзины перед оформлением. */
export async function assertCartAvailable(db: PrismaClient, userId: number) {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: { variant: { include: { product: true } } },
  });
  if (items.length === 0) throw badRequest('Корзина пуста');

  for (const item of items) {
    if (!item.variant.product.isActive) {
      throw badRequest(`Товар «${item.variant.product.name}» снят с продажи. Удалите его из корзины`);
    }
    if (item.quantity > item.variant.stock) {
      throw badRequest(
        `«${item.variant.product.name}» (${item.variant.size}, ${item.variant.color}): на складе осталось ${item.variant.stock} шт.`,
        { variantId: item.variantId, available: item.variant.stock },
      );
    }
  }
  return items;
}

/** Себестоимость позиции корзины (используется при создании заказа, только для админ-статистики). */
export function itemCostCents(item: { variant: { product: Parameters<typeof unitCost>[0] } }): number {
  return unitCost(item.variant.product);
}
