import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { badRequest, forbidden, notFound } from '../utils/http-error';
import { kopecksToRubles } from '../utils/money';
import { generateOrderNumber } from '../utils/slug';
import { assertCartAvailable, deliveryCostCents } from './cart.service';
import { applyPromocode } from './promo.service';

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS_TITLES: Record<OrderStatus, string> = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  processing: 'Собирается',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

export const DELIVERY_TITLES: Record<string, string> = {
  pickup: 'Пункт выдачи',
  courier: 'Курьер',
  post: 'Почта России',
};

/** Заказы, которые участвуют в финансовой статистике. */
const REVENUE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

const orderInclude = {
  items: {
    include: {
      product: { select: { id: true, slug: true, name: true } },
      variant: { select: { id: true, size: true, color: true, sku: true } },
    },
  },
  promocode: { select: { code: true, type: true, value: true } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function mapOrder(order: OrderRow, opts: { includeFinance?: boolean; includeUser?: boolean; user?: { id: number; firstName: string; lastName: string | null; email: string } | null } = {}) {
  const items = order.items.map((item) => {
    const base = {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      name: item.productName,
      slug: item.product?.slug ?? null,
      size: item.size,
      color: item.color,
      sku: item.variant?.sku ?? null,
      image: item.imageUrl,
      unitPrice: kopecksToRubles(item.unitPriceCents),
      quantity: item.quantity,
      lineTotal: kopecksToRubles(item.unitPriceCents * item.quantity),
      lineTotalCents: item.unitPriceCents * item.quantity,
    };
    if (!opts.includeFinance) return base;
    return {
      ...base,
      unitCost: kopecksToRubles(item.unitCostCents),
      lineCost: kopecksToRubles(item.unitCostCents * item.quantity),
      lineProfit: kopecksToRubles((item.unitPriceCents - item.unitCostCents) * item.quantity),
    };
  });

  const costCents = order.costCents;
  const profitCents = order.itemsTotalCents - order.discountCents - costCents;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusTitle: ORDER_STATUS_TITLES[order.status as OrderStatus],
    customerName: order.customerName,
    phone: order.phone,
    city: order.city,
    address: order.address,
    pickupPoint: order.pickupPoint,
    deliveryMethod: order.deliveryMethod,
    deliveryTitle: DELIVERY_TITLES[order.deliveryMethod] ?? order.deliveryMethod,
    comment: order.comment,
    promocode: order.promocode?.code ?? null,
    items,
    itemsTotal: kopecksToRubles(order.itemsTotalCents),
    deliveryCost: kopecksToRubles(order.deliveryCostCents),
    discount: kopecksToRubles(order.discountCents),
    total: kopecksToRubles(order.totalCents),
    totalCents: order.totalCents,
    itemsCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    ...(opts.includeUser && opts.user ? { user: opts.user } : {}),
    ...(opts.includeFinance
      ? {
          finance: {
            revenue: kopecksToRubles(order.itemsTotalCents - order.discountCents),
            cost: kopecksToRubles(costCents),
            deliveryIncome: kopecksToRubles(order.deliveryCostCents),
            profit: kopecksToRubles(profitCents),
            margin:
              order.itemsTotalCents - order.discountCents > 0
                ? Math.round(
                    (profitCents / (order.itemsTotalCents - order.discountCents)) * 1000,
                  ) / 10
                : 0,
          },
        }
      : {}),
  };
}

export interface CreateOrderInput {
  customerName: string;
  phone: string;
  city: string;
  deliveryMethod: 'pickup' | 'courier' | 'post';
  address?: string;
  pickupPoint?: string;
  comment?: string;
  promocode?: string;
}

/**
 * Оформление заказа: проверка остатков, фиксация цен и себестоимости,
 * списание склада, применение промокода и очистка корзины — в одной транзакции.
 */
export async function createOrder(db: PrismaClient, userId: number, input: CreateOrderInput) {
  const cartItems = await assertCartAvailable(db, userId);

  const itemsTotalCents = cartItems.reduce(
    (sum, item) => sum + item.variant.product.priceCents * item.quantity,
    0,
  );
  const deliveryCents = deliveryCostCents(input.deliveryMethod, itemsTotalCents);
  const promo = await applyPromocode(db, input.promocode, itemsTotalCents, userId);

  if (input.deliveryMethod === 'courier' || input.deliveryMethod === 'post') {
    if (!input.address || input.address.trim().length < 5) {
      throw badRequest('Укажите адрес доставки');
    }
  }
  if (input.deliveryMethod === 'pickup' && (!input.pickupPoint || input.pickupPoint.trim().length < 3)) {
    throw badRequest('Укажите пункт выдачи');
  }

  const totalCents = Math.max(0, itemsTotalCents - promo.discountCents) + deliveryCents;

  // Себестоимость проданного (фиксация на момент заказа)
  const costCents = cartItems.reduce((sum, item) => {
    const p = item.variant.product;
    return (
      sum +
      (p.purchasePriceCents +
        p.deliveryCostCents +
        p.commissionCents +
        p.customsCents +
        p.packagingCents +
        p.paymentFeeCents +
        p.advertisingCents) *
        item.quantity
    );
  }, 0);

  const seq = await db.order.count();

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number: generateOrderNumber(seq + 1),
        userId,
        status: 'pending',
        customerName: input.customerName.trim(),
        phone: input.phone.trim(),
        city: input.city.trim(),
        address: input.address?.trim() || null,
        pickupPoint: input.pickupPoint?.trim() || null,
        deliveryMethod: input.deliveryMethod,
        comment: input.comment?.trim() || null,
        itemsTotalCents,
        deliveryCostCents: deliveryCents,
        discountCents: promo.discountCents,
        totalCents,
        costCents,
        promocodeId: promo.promocodeId,
        items: {
          create: cartItems.map((item) => {
            const p = item.variant.product;
            const unitCostCents =
              p.purchasePriceCents +
              p.deliveryCostCents +
              p.commissionCents +
              p.customsCents +
              p.packagingCents +
              p.paymentFeeCents +
              p.advertisingCents;
            return {
              productId: p.id,
              variantId: item.variantId,
              productName: p.name,
              size: item.variant.size,
              color: item.variant.color,
              imageUrl: null,
              unitPriceCents: p.priceCents,
              unitCostCents,
              quantity: item.quantity,
            };
          }),
        },
      },
      include: orderInclude,
    });

    // Списание остатков
    for (const item of cartItems) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (promo.promocodeId) {
      await tx.promocode.update({
        where: { id: promo.promocodeId },
        data: { usedCount: { increment: 1 } },
      });
      await tx.promoUsage.create({
        data: {
          promocodeId: promo.promocodeId,
          userId,
          discountCents: promo.discountCents,
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { userId } });

    return created;
  });

  // Подтягиваем фотографии товаров для позиций заказа
  const productIds = [...new Set(order.items.map((i) => i.productId))];
  const images = await db.productImage.findMany({
    where: { productId: { in: productIds } },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
  });
  const imageByProduct = new Map<number, string>();
  for (const img of images) {
    if (!imageByProduct.has(img.productId)) imageByProduct.set(img.productId, img.url);
  }
  await db.$transaction(
    order.items
      .filter((i) => imageByProduct.has(i.productId))
      .map((i) =>
        db.orderItem.update({
          where: { id: i.id },
          data: { imageUrl: imageByProduct.get(i.productId) },
        }),
      ),
  );

  return getOrderById(db, order.id, { userId, asAdmin: false });
}

export async function getOrderById(
  db: PrismaClient,
  id: number,
  opts: { userId?: number; asAdmin?: boolean },
) {
  const order = await db.order.findUnique({
    where: { id },
    include: { ...orderInclude, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  if (!order) throw notFound('Заказ не найден');

  if (!opts.asAdmin && opts.userId !== undefined && order.userId !== opts.userId) {
    throw forbidden('Это чужой заказ');
  }

  return mapOrder(order, {
    includeFinance: Boolean(opts.asAdmin),
    includeUser: Boolean(opts.asAdmin),
    user: order.user,
  });
}

export async function listOrders(
  db: PrismaClient,
  opts: {
    userId?: number;
    asAdmin?: boolean;
    page?: number;
    limit?: number;
    status?: OrderStatus;
    q?: string;
  },
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const where: Prisma.OrderWhereInput = {};
  if (opts.userId !== undefined && !opts.asAdmin) where.userId = opts.userId;
  if (opts.status) where.status = opts.status;
  if (opts.q) {
    const q = opts.q.trim();
    where.OR = [
      { number: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      include: { ...orderInclude, user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map((o) =>
      mapOrder(o, { includeFinance: Boolean(opts.asAdmin), includeUser: Boolean(opts.asAdmin), user: o.user }),
    ),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

/** Разрешённые переходы статусов заказа. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled', 'processing'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export async function changeOrderStatus(
  db: PrismaClient,
  orderId: number,
  status: OrderStatus,
  opts: { asAdmin: boolean; userId?: number },
) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw notFound('Заказ не найден');
  if (!opts.asAdmin && opts.userId !== undefined && order.userId !== opts.userId) {
    throw forbidden('Это чужой заказ');
  }

  const current = order.status as OrderStatus;
  if (current === status) return getOrderById(db, orderId, opts);

  const allowed = opts.asAdmin
    ? (['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'] as OrderStatus[])
    : TRANSITIONS[current];

  // Покупатель может только отменить неоплаченный заказ либо оплатить (pending -> paid)
  const customerAllowed: OrderStatus[] = current === 'pending' ? ['paid', 'cancelled'] : [];
  if (!opts.asAdmin && !customerAllowed.includes(status)) {
    throw badRequest(`Нельзя изменить статус заказа с «${ORDER_STATUS_TITLES[current]}» на «${ORDER_STATUS_TITLES[status]}»`);
  }
  if (opts.asAdmin && !allowed.includes(status)) {
    throw badRequest(`Недопустимый переход статуса: «${ORDER_STATUS_TITLES[current]}» → «${ORDER_STATUS_TITLES[status]}»`);
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status } });

    // Возврат остатков на склад при отмене и повторное списание при отмене отмены
    if (status === 'cancelled' && current !== 'cancelled') {
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
  });

  return getOrderById(db, orderId, opts);
}

export { REVENUE_STATUSES, mapOrder, orderInclude };
