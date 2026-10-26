import type { Request, Response } from 'express';
import { getPrisma } from '../config/prisma';
import { asyncHandler } from '../utils/async-handler';
import { badRequest, notFound } from '../utils/http-error';
import { validateBody } from '../utils/validate';
import { categorySchema } from '../validators/schemas';
import { slugify, uniqueSlug } from '../utils/slug';

const withCounts = {
  include: { _count: { select: { products: { where: { isActive: true } } } } },
  orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
};

/** GET /api/categories — список категорий (публично, только активные). */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const isAdmin = req.user?.role === 'ADMIN';
  const rows = await db.category.findMany({
    ...withCounts,
    where: isAdmin ? {} : { isActive: true },
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

/** POST /api/categories — создать категорию (админ). */
export const create = asyncHandler(async (req: Request, res: Response) => {
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

/** PUT /api/categories/:id — обновить категорию (админ). */
export const update = asyncHandler(async (req: Request, res: Response) => {
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
      db.category
        .findUnique({ where: { slug: s }, select: { id: true } })
        .then((r) => Boolean(r && r.id !== id)),
    );
  }

  const category = await db.category.update({ where: { id }, data });
  res.json(category);
});

/** DELETE /api/categories/:id — удалить категорию (админ). */
export const remove = asyncHandler(async (req: Request, res: Response) => {
  const db = await getPrisma();
  const id = Number(req.params.id);
  const existing = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!existing) throw notFound('Категория не найдена');
  if (existing._count.products > 0) {
    throw badRequest(
      `В категории ${existing._count.products} товар(ов). Сначала перенесите их в другую категорию или скройте категорию`,
    );
  }
  await db.category.delete({ where: { id } });
  res.json({ success: true });
});
