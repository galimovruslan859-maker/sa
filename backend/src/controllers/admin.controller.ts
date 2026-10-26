import type { Request, Response } from 'express';
import { z } from 'zod';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { badRequest, notFound } from '../utils/http-error';
import { kopecksToRubles } from '../utils/money';
import { validate, validateBody } from '../utils/validate';
import {
  categorySchema,
  adminProductQuerySchema,
  createProductSchema,
  expenseSchema,
  paginationSchema,
  promocodeSchema,
  purchaseSchema,
  statsQuerySchema,
  stockSchema,
  supplierSchema,
  updateProductSchema,
  orderStatusSchema,
} from '../validators/schemas';
import {
  getProductAdmin,
  listProductsAdmin,
  createProduct,
  deleteProduct,
  updateProduct,
} from '../services/product.service';
import * as statsService from '../services/stats.service';
import * as orderService from '../services/order.service';
import { createPromocode, toPublicPromocode, updatePromocode } from '../services/promo.service';
import { slugify, uniqueSlug } from '../utils/slug';

// ================================ АНАЛИТИКА ===============================

function parseRange(query: Record<string, unknown>) {
  const q = validate(statsQuerySchema, query);
  if (q.from || q.to) {
    return { from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined };
  }
  if (q.days) {
    const to = new Date();
    const from = new Date(to.getTime() - (q.days - 1) * 86_400_000);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  return undefined;
}

/** GET /api/admin/statistics */
export const statistics = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const range = parseRange(req.query as Record<string, unknown>);
  const [stats, ranking, lowStock] = await Promise.all([
    statsService.getStatistics(db, range),
    statsService.getSalesRanking(db, 8),
    statsService.getLowStock(db, 3),
  ]);
  res.json({ ...stats, bestSellers: ranking.top, lowSales: ranking.low, lowStock });
});

/** GET /api/admin/profit — прибыль по каждому товару. */
export const profit = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  res.json(await statsService.getProfitReport(db));
});

/** GET /api/admin/statistics/stock — остатки на складе. */
export const stock = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  res.json(await statsService.getLowStock(db, 5));
});

// ================================= ТОВАРЫ =================================

/** GET /api/admin/products */
export const products = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const query = validate(adminProductQuerySchema, req.query);
  res.json(await listProductsAdmin(db, query));
});

/** GET /api/admin/products/:id */
export const productDetail = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  res.json(await getProductAdmin(db, Number(req.params.id)));
});

/** POST /api/admin/products */
export const createProductAdmin = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(createProductSchema, req.body);
  const product = await createProduct(db, input);
  res.status(201).json(await getProductAdmin(db, product.id));
});

/** PUT /api/admin/products/:id */
export const updateProductAdmin = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const input = validateBody(updateProductSchema, req.body);
  await updateProduct(db, id, input);
  res.json(await getProductAdmin(db, id));
});

/** DELETE /api/admin/products/:id */
export const removeProduct = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  await deleteProduct(db, id);
  const exists = await db.product.findUnique({ where: { id }, select: { isActive: true } });
  res.json({
    success: true,
    deleted: !exists,
    message: exists ? 'Товар снят с продажи (он участвует в истории заказов)' : 'Товар удалён',
  });
});

/** PUT /api/admin/products/:id/variants/:variantId/stock — изменить остаток. */
export const updateStock = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const variantId = Number(req.params.variantId);
  const input = validateBody(stockSchema, req.body);

  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { id: true } } },
  });
  if (!variant) throw notFound('Вариация не найдена');

  await db.productVariant.update({
    where: { id: variantId },
    data: {
      stock: input.stock,
      ...(input.purchasePrice !== undefined
        ? { purchasePriceCents: Math.round(input.purchasePrice * 100) }
        : {}),
    },
  });

  res.json(await getProductAdmin(db, variant.product.id));
});

/** PUT /api/admin/products/:id/stock — массовое обновление остатков. */
export const updateStockBulk = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const productId = Number(req.params.id);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) throw badRequest('Передайте список items: [{ variantId, stock }]');

  await db.$transaction(
    items.map((item: { variantId: number; stock: number }) =>
      db.productVariant.updateMany({
        where: { id: Number(item.variantId), productId },
        data: { stock: Math.max(0, Math.trunc(Number(item.stock) || 0)) },
      }),
    ),
  );

  res.json(await getProductAdmin(db, productId));
});

// ================================ КАТЕГОРИИ ===============================

/** GET /api/admin/categories — все категории, включая неактивные. */
export const categories = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      productsCount: c._count.products,
    })),
    total: rows.length,
  });
});

/** POST /api/admin/categories */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(categorySchema, req.body);
  const slug = await uniqueSlug(input.slug || input.name, async (s) =>
    db.category.findUnique({ where: { slug: s }, select: { id: true } }).then(Boolean),
  );
  const category = await db.category.create({
    data: {
      name: input.name,
      slug,
      description: input.description || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
  res.status(201).json(category);
});

/** PUT /api/admin/categories/:id */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) throw notFound('Категория не найдена');

  const input = validateBody(categorySchema.partial(), req.body);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.slug !== undefined && slugify(input.slug) !== existing.slug) {
    data.slug = await uniqueSlug(input.slug, async (s) =>
      db.category.findUnique({ where: { slug: s }, select: { id: true } }).then((r) => Boolean(r && r.id !== id)),
    );
  }
  res.json(await db.category.update({ where: { id }, data }));
});

/** DELETE /api/admin/categories/:id */
export const removeCategory = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!existing) throw notFound('Категория не найдена');
  if (existing._count.products > 0) {
    throw badRequest(`В категории ${existing._count.products} товар(ов) — сначала перенесите их`);
  }
  await db.category.delete({ where: { id } });
  res.json({ success: true });
});

// ================================= ЗАКАЗЫ =================================

/** GET /api/admin/orders */
export const orders = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const query = validate(paginationSchema, req.query);
  res.json(
    await orderService.listOrders(db, {
      asAdmin: true,
      page: query.page,
      limit: query.limit,
      status: query.status,
      q: query.q,
    }),
  );
});

/** GET /api/admin/orders/:id */
export const orderDetail = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  res.json(await orderService.getOrderById(db, Number(req.params.id), { asAdmin: true }));
});

/** PUT /api/admin/orders/:id/status */
export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(orderStatusSchema, req.body);
  res.json(
    await orderService.changeOrderStatus(db, Number(req.params.id), input.status, { asAdmin: true }),
  );
});

// ============================== ПОЛЬЗОВАТЕЛИ ==============================

/** GET /api/admin/users */
export const users = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const query = validate(
    paginationSchema.extend({ role: z.enum(['CUSTOMER', 'ADMIN']).optional() }),
    req.query,
  );

  const where = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' as const } },
            { firstName: { contains: query.q, mode: 'insensitive' as const } },
            { lastName: { contains: query.q, mode: 'insensitive' as const } },
            { phone: { contains: query.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        _count: { select: { orders: true, reviews: true, favorites: true } },
        orders: {
          where: { status: { in: orderService.REVENUE_STATUSES } },
          select: { totalCents: true },
        },
      },
    }),
  ]);

  res.json({
    items: rows.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      ordersCount: u._count.orders,
      reviewsCount: u._count.reviews,
      favoritesCount: u._count.favorites,
      totalSpent: kopecksToRubles(u.orders.reduce((s, o) => s + o.totalCents, 0)),
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  });
});

/** PUT /api/admin/users/:id — изменить роль / заблокировать. */
export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing) throw notFound('Пользователь не найден');

  const role = req.body?.role === 'ADMIN' || req.body?.role === 'CUSTOMER' ? req.body.role : undefined;
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : undefined;

  if (id === req.user!.sub && (role === 'CUSTOMER' || isActive === false)) {
    throw badRequest('Нельзя понизить или заблокировать собственную учётную запись');
  }

  const user = await db.user.update({
    where: { id },
    data: { ...(role ? { role } : {}), ...(isActive !== undefined ? { isActive } : {}) },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, isActive: true, createdAt: true },
  });
  res.json(user);
});

// ================================ ПРОМОКОДЫ ===============================

/** GET /api/admin/promocodes */
export const promocodes = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.promocode.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ items: rows.map(toPublicPromocode), total: rows.length });
});

/** POST /api/admin/promocodes */
export const createPromocodeAdmin = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(promocodeSchema, req.body);
  res.status(201).json(await createPromocode(db, input));
});

/** PUT /api/admin/promocodes/:id */
export const updatePromocodeAdmin = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(promocodeSchema.partial(), req.body);
  res.json(await updatePromocode(db, Number(req.params.id), input));
});

/** DELETE /api/admin/promocodes/:id */
export const removePromocode = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.promocode.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
  if (!existing) throw notFound('Промокод не найден');
  if (existing._count.orders > 0) {
    await db.promocode.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true, deleted: false, message: 'Промокод использовался в заказах — он деактивирован' });
    return;
  }
  await db.promocode.delete({ where: { id } });
  res.json({ success: true, deleted: true });
});

// ================================= РАСХОДЫ ================================

/** GET /api/admin/expenses */
export const expenses = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.expense.findMany({ orderBy: { date: 'desc' }, take: 500 });
  const total = await db.expense.aggregate({ _sum: { amountCents: true } });
  res.json({
    items: rows.map((e) => ({
      id: e.id,
      category: e.category,
      amount: kopecksToRubles(e.amountCents),
      title: e.title,
      note: e.note,
      date: e.date,
    })),
    total: kopecksToRubles(total._sum.amountCents ?? 0),
  });
});

/** POST /api/admin/expenses */
export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(expenseSchema, req.body);
  const expense = await db.expense.create({
    data: {
      category: input.category,
      amountCents: Math.round(input.amount * 100),
      title: input.title,
      note: input.note || null,
      date: input.date ? new Date(input.date) : new Date(),
    },
  });
  res.status(201).json({ ...expense, amount: kopecksToRubles(expense.amountCents) });
});

/** DELETE /api/admin/expenses/:id */
export const removeExpense = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.expense.findUnique({ where: { id } });
  if (!existing) throw notFound('Расход не найден');
  await db.expense.delete({ where: { id } });
  res.json({ success: true });
});

// =============================== ПОСТАВЩИКИ ===============================

/** GET /api/admin/suppliers */
export const suppliers = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.supplier.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true, purchases: true } } },
  });
  res.json({ items: rows, total: rows.length });
});

/** POST /api/admin/suppliers */
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(supplierSchema, req.body);
  const supplier = await db.supplier.create({
    data: {
      name: input.name,
      contactName: input.contactName || null,
      phone: input.phone || null,
      email: input.email || null,
      country: input.country || 'Китай',
      note: input.note || null,
    },
  });
  res.status(201).json(supplier);
});

/** DELETE /api/admin/suppliers/:id */
export const removeSupplier = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.supplier.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!existing) throw notFound('Поставщик не найден');
  if (existing._count.products > 0) {
    throw badRequest('У поставщика есть товары — сначала открепите их');
  }
  await db.supplier.delete({ where: { id } });
  res.json({ success: true });
});

// ================================= ЗАКУПКИ ================================

/** GET /api/admin/purchases */
export const purchases = asyncHandler(async (_req: Request, res: Response) => {
  const db = await getPrisma();
  const rows = await db.purchase.findMany({
    orderBy: { orderDate: 'desc' },
    include: { supplier: { select: { id: true, name: true } }, items: true },
  });
  res.json({
    items: rows.map((p) => ({
      id: p.id,
      number: p.number,
      status: p.status,
      supplier: p.supplier,
      orderDate: p.orderDate,
      receivedAt: p.receivedAt,
      total: kopecksToRubles(p.totalCents),
      delivery: kopecksToRubles(p.deliveryCents),
      commission: kopecksToRubles(p.commissionCents),
      customs: kopecksToRubles(p.customsCents),
      totalWithCosts: kopecksToRubles(p.totalCents + p.deliveryCents + p.commissionCents + p.customsCents),
      note: p.note,
      items: p.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        unitCost: kopecksToRubles(i.unitCostCents),
        sum: kopecksToRubles(i.unitCostCents * i.quantity),
      })),
    })),
    total: rows.length,
  });
});

/** POST /api/admin/purchases */
export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(purchaseSchema, req.body);

  const supplier = await db.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) throw badRequest('Поставщик не найден');

  const totalCents = input.items.reduce((s, i) => s + Math.round(i.unitCost * 100) * i.quantity, 0);
  const count = await db.purchase.count();

  const purchase = await db.purchase.create({
    data: {
      number: input.number || `PUR-${String(count + 1).padStart(4, '0')}`,
      supplierId: input.supplierId,
      status: input.status ?? 'draft',
      totalCents,
      deliveryCents: Math.round(input.delivery * 100),
      commissionCents: Math.round(input.commission * 100),
      customsCents: Math.round(input.customs * 100),
      note: input.note || null,
      items: {
        create: input.items.map((i) => ({
          productId: i.productId ?? null,
          name: i.name,
          quantity: i.quantity,
          unitCostCents: Math.round(i.unitCost * 100),
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  res.status(201).json(purchase);
});

/** PUT /api/admin/purchases/:id/status — приёмка закупки увеличивает остатки. */
export const updatePurchaseStatus = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const status = String(req.body?.status);
  const allowed = ['draft', 'ordered', 'in_transit', 'received', 'cancelled'];
  if (!allowed.includes(status)) throw badRequest('Некорректный статус закупки');

  const purchase = await db.purchase.findUnique({ where: { id }, include: { items: true } });
  if (!purchase) throw notFound('Закупка не найдена');

  await db.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id },
      data: { status: status as typeof purchase.status, receivedAt: status === 'received' ? new Date() : null },
    });

    // При приёмке распределяем количество по вариациям связанных товаров
    if (status === 'received' && purchase.status !== 'received') {
      for (const item of purchase.items) {
        if (!item.productId) continue;
        const variants = await tx.productVariant.findMany({
          where: { productId: item.productId },
          orderBy: { id: 'asc' },
        });
        if (variants.length === 0) continue;
        const perVariant = Math.floor(item.quantity / variants.length);
        const rest = item.quantity - perVariant * variants.length;
        for (let i = 0; i < variants.length; i += 1) {
          await tx.productVariant.update({
            where: { id: variants[i].id },
            data: { stock: { increment: perVariant + (i === 0 ? rest : 0) } },
          });
        }
      }
    }
  });

  res.json({ success: true, id, status });
});
