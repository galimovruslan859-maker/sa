import type { PrismaClient } from '../generated/prisma/client';
import { kopecksToRubles, marginPercent } from '../utils/money';
import { REVENUE_STATUSES } from './order.service';

const REVENUE_WHERE = { status: { in: REVENUE_STATUSES } } as const;

function money(cents: number): number {
  return kopecksToRubles(cents);
}

/**
 * Полная финансовая и операционная статистика магазина.
 * Доступна только администратору (GET /api/admin/statistics).
 */
export async function getStatistics(
  db: PrismaClient,
  range?: { from?: Date; to?: Date },
) {
  const orderWhere = range?.from || range?.to
    ? {
        ...REVENUE_WHERE,
        createdAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        },
      }
    : { ...REVENUE_WHERE };

  const ordersWhereAny = range?.from || range?.to
    ? {
        createdAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        },
      }
    : {};

  const [
    ordersAgg,
    allOrdersAgg,
    ordersCount,
    paidOrdersCount,
    cancelledCount,
    customersCount,
    productsCount,
    stockAgg,
    expenseAgg,
    expenseByCategory,
    statusCounts,
    revenueByDay,
  ] = await Promise.all([
    db.order.aggregate({
      where: orderWhere,
      _sum: { itemsTotalCents: true, discountCents: true, deliveryCostCents: true, totalCents: true, costCents: true },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: REVENUE_WHERE,
      _sum: { itemsTotalCents: true, discountCents: true, totalCents: true, costCents: true },
    }),
    db.order.count({ where: ordersWhereAny }),
    db.order.count({ where: orderWhere }),
    db.order.count({ where: { ...ordersWhereAny, status: 'cancelled' } }),
    db.user.count({ where: { role: 'CUSTOMER' } }),
    db.product.count({ where: { isActive: true } }),
    db.productVariant.aggregate({ _sum: { stock: true }, _count: { _all: true } }),
    db.expense.aggregate({
      where: range?.from || range?.to
        ? {
            date: {
              ...(range.from ? { gte: range.from } : {}),
              ...(range.to ? { lte: range.to } : {}),
            },
          }
        : {},
      _sum: { amountCents: true },
    }),
    db.expense.groupBy({ by: ['category'], _sum: { amountCents: true }, orderBy: { _sum: { amountCents: 'desc' } } }),
    db.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { totalCents: true } }),
    db.order.findMany({
      where: REVENUE_WHERE,
      select: { createdAt: true, totalCents: true, itemsTotalCents: true, discountCents: true, costCents: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const grossRevenueCents = (ordersAgg._sum.itemsTotalCents ?? 0) - (ordersAgg._sum.discountCents ?? 0);
  const revenueCents = grossRevenueCents + (ordersAgg._sum.deliveryCostCents ?? 0);
  const cogsCents = ordersAgg._sum.costCents ?? 0;
  const expensesCents = expenseAgg._sum.amountCents ?? 0;
  const profitCents = revenueCents - cogsCents - expensesCents;
  const unitsAgg = await db.orderItem.aggregate({
    where: { order: orderWhere },
    _sum: { quantity: true },
  });
  const unitsSold = unitsAgg._sum.quantity ?? 0;
  const avgCheckCents = paidOrdersCount > 0 ? Math.round(revenueCents / paidOrdersCount) : 0;

  // Динамика по дням (последние 30 дней с продажами)
  const byDay = new Map<string, { date: string; revenue: number; profit: number; orders: number }>();
  for (const o of revenueByDay) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(key) ?? { date: key, revenue: 0, profit: 0, orders: 0 };
    const rev = o.itemsTotalCents - o.discountCents;
    row.revenue += rev;
    row.profit += rev - o.costCents;
    row.orders += 1;
    byDay.set(key, row);
  }
  const daily = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((d) => ({ ...d, revenue: money(d.revenue), profit: money(d.profit) }));

  return {
    range: { from: range?.from ?? null, to: range?.to ?? null },
    orders: {
      total: ordersCount,
      paid: paidOrdersCount,
      cancelled: cancelledCount,
      byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count._all, sum: money(s._sum.totalCents ?? 0) })),
      averageCheck: money(avgCheckCents),
      unitsSold,
    },
    finance: {
      revenue: money(revenueCents),
      grossRevenue: money(grossRevenueCents),
      deliveryIncome: money(ordersAgg._sum.deliveryCostCents ?? 0),
      discounts: money(ordersAgg._sum.discountCents ?? 0),
      cost: money(cogsCents),
      expenses: money(expensesCents),
      profit: money(profitCents),
      margin: marginPercent(profitCents, revenueCents),
      grossMargin: marginPercent(grossRevenueCents - cogsCents, grossRevenueCents),
      expensesByCategory: expenseByCategory.map((e) => ({
        category: e.category,
        amount: money(e._sum.amountCents ?? 0),
      })),
    },
    catalog: {
      activeProducts: productsCount,
      totalStockUnits: stockAgg._sum.stock ?? 0,
      variantCount: stockAgg._count._all,
      customers: customersCount,
    },
    allTime: {
      revenue: money((allOrdersAgg._sum.itemsTotalCents ?? 0) - (allOrdersAgg._sum.discountCents ?? 0) + 0),
      cost: money(allOrdersAgg._sum.costCents ?? 0),
      profit: money((allOrdersAgg._sum.itemsTotalCents ?? 0) - (allOrdersAgg._sum.discountCents ?? 0) - (allOrdersAgg._sum.costCents ?? 0)),
    },
    daily,
  };
}

/** Самые продаваемые товары и товары с низкими продажами. */
export async function getSalesRanking(db: PrismaClient, limit = 5) {
  const grouped = await db.orderItem.groupBy({
    by: ['productId'],
    where: { order: REVENUE_WHERE },
    _sum: { quantity: true, unitPriceCents: true, unitCostCents: true },
  });

  const products = await db.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId) } },
    include: {
      category: { select: { name: true } },
      images: { where: { isPrimary: true }, take: 1 },
      variants: { select: { stock: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const rows = grouped
    .map((g) => {
      const p = productMap.get(g.productId);
      const units = g._sum.quantity ?? 0;
      // прибыль = (цена − себестоимость) × количество
      const revenueCents = p ? p.priceCents * units : 0;
      const costCents = p
        ? (p.purchasePriceCents +
            p.deliveryCostCents +
            p.commissionCents +
            p.customsCents +
            p.packagingCents +
            p.paymentFeeCents +
            p.advertisingCents) *
          units
        : (g._sum.unitCostCents ?? 0) * units;
      return {
        productId: g.productId,
        name: p?.name ?? 'Товар удалён',
        slug: p?.slug ?? null,
        category: p?.category.name ?? null,
        image: p?.images[0]?.url ?? null,
        price: p ? money(p.priceCents) : 0,
        unitsSold: units,
        revenue: money(revenueCents),
        profit: money(revenueCents - costCents),
        stock: p ? p.variants.reduce((s, v) => s + v.stock, 0) : 0,
        isActive: p?.isActive ?? false,
      };
    })
    .sort((a, b) => b.unitsSold - a.unitsSold);

  return {
    top: rows.slice(0, limit),
    low: [...rows].reverse().filter((r) => r.unitsSold <= 2).slice(0, limit),
    total: rows.length,
  };
}

/** Прибыль по каждому товару (GET /api/admin/profit). */
export async function getProfitReport(db: PrismaClient) {
  const products = await db.product.findMany({
    include: {
      category: { select: { name: true } },
      supplier: { select: { name: true } },
      variants: { select: { stock: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const sold = await db.orderItem.groupBy({
    by: ['productId'],
    where: { order: REVENUE_WHERE },
    _sum: { quantity: true },
  });
  const soldMap = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));

  const rows = products.map((p) => {
    const costCents =
      p.purchasePriceCents +
      p.deliveryCostCents +
      p.commissionCents +
      p.customsCents +
      p.packagingCents +
      p.paymentFeeCents +
      p.advertisingCents;
    const profitCents = p.priceCents - costCents;
    const unitsSold = soldMap.get(p.id) ?? 0;
    return {
      productId: p.id,
      name: p.name,
      category: p.category.name,
      supplier: p.supplier?.name ?? null,
      stock: p.variants.reduce((s, v) => s + v.stock, 0),
      purchasePrice: money(p.purchasePriceCents),
      deliveryCost: money(p.deliveryCostCents),
      commission: money(p.commissionCents),
      customs: money(p.customsCents),
      packaging: money(p.packagingCents),
      paymentFee: money(p.paymentFeeCents),
      advertising: money(p.advertisingCents),
      cost: money(costCents),
      price: money(p.priceCents),
      profit: money(profitCents),
      margin: marginPercent(profitCents, p.priceCents),
      unitsSold,
      totalProfit: money(profitCents * unitsSold),
      isActive: p.isActive,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      cost: acc.cost + r.cost,
      price: acc.price + r.price,
      profit: acc.profit + r.profit,
      totalProfit: acc.totalProfit + r.totalProfit,
      unitsSold: acc.unitsSold + r.unitsSold,
      stock: acc.stock + r.stock,
    }),
    { cost: 0, price: 0, profit: 0, totalProfit: 0, unitsSold: 0, stock: 0 },
  );

  return {
    items: rows.sort((a, b) => b.totalProfit - a.totalProfit),
    totals: {
      ...totals,
      cost: Math.round(totals.cost * 100) / 100,
      price: Math.round(totals.price * 100) / 100,
      profit: Math.round(totals.profit * 100) / 100,
      totalProfit: Math.round(totals.totalProfit * 100) / 100,
    },
  };
}

/** Товары и вариации, которые заканчиваются на складе. */
export async function getLowStock(db: PrismaClient, threshold = 3) {
  const variants = await db.productVariant.findMany({
    where: { stock: { lte: threshold }, product: { isActive: true } },
    include: { product: { select: { id: true, name: true, slug: true, isActive: true } } },
    orderBy: { stock: 'asc' },
    take: 100,
  });

  const outOfStockProducts = await db.product.findMany({
    where: {
      isActive: true,
      variants: { none: { stock: { gt: 0 } } },
    },
    select: { id: true, name: true, slug: true },
  });

  return {
    threshold,
    variants: variants.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      stock: v.stock,
      product: v.product,
    })),
    outOfStockProducts,
  };
}
