import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { validateBody } from '../utils/validate';
import { addToCartSchema, updateCartItemSchema } from '../validators/schemas';
import * as cartService from '../services/cart.service';

const userId = (req: Request) => req.user!.sub;

/** GET /api/cart */
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const cart = await cartService.getCart(db, userId(req));
  res.json({ ...cart, delivery: cartService.describeDelivery(cart.itemsTotalCents) });
});

/** POST /api/cart */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(addToCartSchema, req.body);
  const cart = await cartService.addToCart(db, userId(req), input.variantId, input.quantity);
  const payload = { ...cart, delivery: cartService.describeDelivery(cart.itemsTotalCents) };
  // 201 — позиция добавлена впервые, 200 — количество увеличено
  res.status(cart.created ? 201 : 200).json(payload);
});

/** PUT /api/cart/:id */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const input = validateBody(updateCartItemSchema, req.body);
  const cart = await cartService.updateCartItem(db, userId(req), Number(req.params.id), input.quantity);
  res.json({ ...cart, delivery: cartService.describeDelivery(cart.itemsTotalCents) });
});

/** DELETE /api/cart/:id */
export const removeItem = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const cart = await cartService.removeCartItem(db, userId(req), Number(req.params.id));
  res.json({ ...cart, delivery: cartService.describeDelivery(cart.itemsTotalCents) });
});

/** DELETE /api/cart — полностью очистить корзину. */
export const clear = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const cart = await cartService.clearCart(db, userId(req));
  res.json({ ...cart, delivery: cartService.describeDelivery(cart.itemsTotalCents) });
});
