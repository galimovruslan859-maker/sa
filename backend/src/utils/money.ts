/**
 * Деньги в проекте хранятся в КОПЕЙКАХ (целые числа).
 * Эти хелперы переводят копейки в рубли и обратно без потерь точности.
 */

export function kopecksToRubles(kopecks: number): number {
  return Math.round(kopecks) / 100;
}

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

/** "449000" -> "4 490 ₽" (форматирование для ответов API при необходимости) */
export function formatRubles(kopecks: number): string {
  const rubles = kopecksToRubles(kopecks);
  return `${rubles.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

/** Себестоимость единицы товара по финансовой модели магазина. */
export function unitCost(product: {
  purchasePriceCents: number;
  deliveryCostCents: number;
  commissionCents: number;
  customsCents: number;
  packagingCents: number;
  paymentFeeCents: number;
  advertisingCents: number;
}): number {
  return (
    product.purchasePriceCents +
    product.deliveryCostCents +
    product.commissionCents +
    product.customsCents +
    product.packagingCents +
    product.paymentFeeCents +
    product.advertisingCents
  );
}

/** Прибыль с единицы товара = цена продажи − себестоимость. */
export function unitProfit(product: { priceCents: number } & Parameters<typeof unitCost>[0]): number {
  return product.priceCents - unitCost(product);
}

/** Маржинальность, % = прибыль / цена продажи × 100. */
export function marginPercent(profit: number, price: number): number {
  if (!price) return 0;
  return Math.round((profit / price) * 1000) / 10;
}
