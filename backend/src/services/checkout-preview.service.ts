import type { PrismaClient } from '../generated/prisma/client';
import { kopecksToRubles } from '../utils/money';
import { deliveryCostCents, getCart } from './cart.service';
import { applyPromocode } from './promo.service';

/**
 * Предварительный расчёт итогов корзины для страницы оформления заказа:
 * товары, доставка, скидка по промокоду, итоговая сумма.
 * Себестоимость сюда не попадает — это данные только для администратора.
 */
export async function cartServicePreview(
  db: PrismaClient,
  userId: number,
  deliveryMethod: 'pickup' | 'courier' | 'post',
  promocode?: string,
) {
  const cart = await getCart(db, userId);
  const itemsTotalCents = cart.itemsTotalCents;
  const deliveryCents = deliveryCostCents(deliveryMethod, itemsTotalCents);

  let discountCents = 0;
  let promoError: string | null = null;
  let appliedCode: string | null = null;

  if (promocode && promocode.trim().length > 0) {
    try {
      const result = await applyPromocode(db, promocode, itemsTotalCents, userId);
      discountCents = result.discountCents;
      appliedCode = result.code;
    } catch (err) {
      promoError = err instanceof Error ? err.message : 'Промокод не применён';
    }
  }

  const totalCents = Math.max(0, itemsTotalCents - discountCents) + deliveryCents;

  return {
    deliveryMethod,
    items: cart.items.map((i) => ({
      id: i.id,
      name: i.name,
      size: i.size,
      color: i.color,
      image: i.image,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    itemsCount: cart.count,
    itemsTotal: kopecksToRubles(itemsTotalCents),
    itemsTotalCents,
    deliveryCost: kopecksToRubles(deliveryCents),
    deliveryCostCents: deliveryCents,
    discount: kopecksToRubles(discountCents),
    discountCents,
    promocode: appliedCode,
    promocodeError: promoError,
    total: kopecksToRubles(totalCents),
    totalCents,
  };
}
