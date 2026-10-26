import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { validate, validateBody } from '../utils/validate';
import { createOrderSchema, orderStatusSchema, paginationSchema } from '../validators/schemas';
import * as orderService from '../services/order.service';
import { cartServicePreview } from '../services/checkout-preview.service';
import { DELIVERY_OPTIONS } from '../services/cart.service';

/** POST /api/orders — оформление заказа из корзины. */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(createOrderSchema, req.body);
  const order = await orderService.createOrder(db, req.user!.sub, input);
  res.status(201).json(order);
});

/** GET /api/orders — история заказов текущего пользователя. */
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const query = validate(paginationSchema, req.query);
  const result = await orderService.listOrders(db, {
    userId: req.user!.sub,
    page: query.page,
    limit: query.limit,
    status: query.status,
    q: query.q,
  });
  res.json(result);
});

/** GET /api/orders/checkout-preview — расчёт итогов до оформления (доставка, промокод). */
export const checkoutPreview = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const rawMethod = String(req.query.deliveryMethod ?? 'pickup');
  const method: 'pickup' | 'courier' | 'post' =
    rawMethod === 'courier' || rawMethod === 'post' ? rawMethod : 'pickup';
  const promocode = req.query.promocode ? String(req.query.promocode) : undefined;
  const preview = await cartServicePreview(db, req.user!.sub, method, promocode);
  res.json(preview);
});

/** GET /api/orders/:id — детали заказа (своего). */
export const detail = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const order = await orderService.getOrderById(db, Number(req.params.id), {
    userId: req.user!.sub,
    asAdmin: false,
  });
  res.json(order);
});

/** PUT /api/orders/:id/status — покупатель может оплатить или отменить свой заказ. */
export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(orderStatusSchema, req.body);
  const order = await orderService.changeOrderStatus(db, Number(req.params.id), input.status, {
    asAdmin: false,
    userId: req.user!.sub,
  });
  res.json(order);
});

/** GET /api/orders/delivery-options — способы доставки (справочник). */
export const deliveryOptions = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ items: DELIVERY_OPTIONS });
});
