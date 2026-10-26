import type { PrismaClient } from '../generated/prisma/client';
import { badRequest, notFound } from '../utils/http-error';
import { kopecksToRubles, rublesToKopecks } from '../utils/money';

export function toPublicPromocode(p: {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: p.id,
    code: p.code,
    type: p.type,
    value: p.type === 'fixed' ? kopecksToRubles(p.value) : p.value,
    minOrder: kopecksToRubles(p.minOrderCents),
    maxUses: p.maxUses,
    usedCount: p.usedCount,
    leftUses: p.maxUses === null ? null : Math.max(0, p.maxUses - p.usedCount),
    expiresAt: p.expiresAt,
    isActive: p.isActive,
    createdAt: p.createdAt,
  };
}

/** Проверяет промокод и возвращает скидку в копейках для данной суммы заказа. */
export async function applyPromocode(
  db: PrismaClient,
  codeRaw: string | undefined,
  itemsTotalCents: number,
  userId: number,
): Promise<{ promocodeId: number | null; discountCents: number; code: string | null }> {
  const code = codeRaw?.trim().toUpperCase();
  if (!code) return { promocodeId: null, discountCents: 0, code: null };

  const promo = await db.promocode.findUnique({ where: { code } });
  if (!promo) throw badRequest(`Промокод «${code}» не найден`);
  if (!promo.isActive) throw badRequest(`Промокод «${code}» больше не действует`);
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
    throw badRequest(`Срок действия промокода «${code}» истёк`);
  }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) {
    throw badRequest(`Промокод «${code}» уже использован максимально число раз`);
  }
  if (itemsTotalCents < promo.minOrderCents) {
    throw badRequest(
      `Промокод «${code}» действует при заказе от ${kopecksToRubles(promo.minOrderCents).toLocaleString('ru-RU')} ₽`,
      { minOrder: kopecksToRubles(promo.minOrderCents) },
    );
  }

  const alreadyUsed = await db.promoUsage.findFirst({ where: { promocodeId: promo.id, userId } });
  if (alreadyUsed) throw badRequest(`Вы уже использовали промокод «${code}»`);

  const discountCents =
    promo.type === 'percent'
      ? Math.round((itemsTotalCents * promo.value) / 100)
      : Math.min(promo.value, itemsTotalCents);

  return { promocodeId: promo.id, discountCents: Math.max(0, discountCents), code: promo.code };
}

export async function createPromocode(
  db: PrismaClient,
  input: {
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    minOrder: number;
    maxUses?: number | null;
    expiresAt?: string | null;
    isActive?: boolean;
  },
) {
  const exists = await db.promocode.findUnique({ where: { code: input.code } });
  if (exists) throw badRequest(`Промокод «${input.code}» уже существует`);

  const promo = await db.promocode.create({
    data: {
      code: input.code,
      type: input.type,
      value: input.type === 'fixed' ? rublesToKopecks(input.value) : Math.round(input.value),
      minOrderCents: rublesToKopecks(input.minOrder),
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      isActive: input.isActive ?? true,
    },
  });
  return toPublicPromocode(promo);
}

export async function updatePromocode(
  db: PrismaClient,
  id: number,
  input: Partial<{
    code: string;
    type: 'percent' | 'fixed';
    value: number;
    minOrder: number;
    maxUses: number | null;
    expiresAt: string | null;
    isActive: boolean;
  }>,
) {
  const existing = await db.promocode.findUnique({ where: { id } });
  if (!existing) throw notFound('Промокод не найден');

  const promo = await db.promocode.update({
    where: { id },
    data: {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined
        ? { value: (input.type ?? existing.type) === 'fixed' ? rublesToKopecks(input.value) : Math.round(input.value) }
        : {}),
      ...(input.minOrder !== undefined ? { minOrderCents: rublesToKopecks(input.minOrder) } : {}),
      ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return toPublicPromocode(promo);
}
