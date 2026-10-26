import { z } from 'zod';

// ---------------------------------------------------------------------------
// Общие схемы
// ---------------------------------------------------------------------------

export const trimmedString = (min: number, max: number) =>
  z
    .string({ required_error: 'Поле обязательно' })
    .trim()
    .min(min, `Минимум ${min} символа`)
    .max(max, `Максимум ${max} символов`);

export const passwordSchema = z
  .string({ required_error: 'Пароль обязателен' })
  .min(6, 'Пароль должен содержать минимум 6 символов')
  .max(72, 'Пароль слишком длинный');

export const moneySchema = z
  .number({ invalid_type_error: 'Ожидается число' })
  .nonnegative('Значение не может быть отрицательным')
  .max(100_000_000, 'Слишком большое значение');

export const intSchema = z
  .number({ invalid_type_error: 'Ожидается целое число' })
  .int('Ожидается целое число')
  .nonnegative('Значение не может быть отрицательным');

// ---------------------------------------------------------------------------
// Аутентификация
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный e-mail'),
  password: passwordSchema,
  firstName: trimmedString(2, 50),
  lastName: trimmedString(2, 50).optional().or(z.literal('')),
  phone: trimmedString(6, 20).optional().or(z.literal('')),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Некорректный e-mail'),
  password: z.string().min(1, 'Введите пароль'),
});

export const updateProfileSchema = z.object({
  firstName: trimmedString(2, 50).optional(),
  lastName: trimmedString(2, 50).optional().or(z.literal('')),
  phone: trimmedString(6, 20).optional().or(z.literal('')),
  password: passwordSchema.optional(),
});

// ---------------------------------------------------------------------------
// Каталог
// ---------------------------------------------------------------------------

export const colorSchema = z.object({
  name: trimmedString(1, 40),
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Цвет в формате #RRGGBB')
    .optional(),
});

export const variantInputSchema = z.object({
  size: trimmedString(1, 10),
  color: trimmedString(1, 40),
  stock: intSchema.default(0),
});

export const financeSchema = z.object({
  purchasePrice: moneySchema.default(0),
  deliveryCost: moneySchema.default(0),
  commission: moneySchema.default(0),
  customs: moneySchema.default(0),
  packaging: moneySchema.default(0),
  paymentFee: moneySchema.default(0),
  advertising: moneySchema.default(0),
});

export const createProductSchema = z.object({
  name: trimmedString(2, 140),
  slug: trimmedString(2, 120).optional(),
  description: z.string().trim().max(5000).optional().or(z.literal('')),
  brand: trimmedString(1, 60).optional().or(z.literal('')),
  categoryId: z.number({ invalid_type_error: 'Укажите категорию' }).int().positive(),
  supplierId: z.number().int().positive().nullable().optional(),
  composition: z.string().trim().max(300).optional().or(z.literal('')),
  specs: z.record(z.string().trim().max(120), z.string().trim().max(300)).optional(),
  sizes: z.array(trimmedString(1, 10)).min(1, 'Укажите хотя бы один размер'),
  colors: z.array(colorSchema).min(1, 'Укажите хотя бы один цвет'),
  price: moneySchema.refine((v) => v > 0, 'Цена должна быть больше нуля'),
  finance: financeSchema.partial().optional(),
  images: z
    .array(z.object({ url: trimmedString(1, 500), alt: z.string().max(200).optional() }))
    .max(20)
    .optional(),
  variants: z.array(variantInputSchema).max(500).optional(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const categorySchema = z.object({
  name: trimmedString(2, 60),
  slug: trimmedString(2, 80).optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Корзина / избранное / отзывы
// ---------------------------------------------------------------------------

export const addToCartSchema = z.object({
  variantId: z.number().int().positive('Укажите вариацию товара'),
  quantity: z.number().int().positive().max(99).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive().max(99),
});

export const productIdParamSchema = z.object({
  productId: z.coerce.number().int().positive(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5'),
  title: trimmedString(2, 120).optional().or(z.literal('')),
  body: z.string().trim().max(2000).optional().or(z.literal('')),
});

// ---------------------------------------------------------------------------
// Заказы
// ---------------------------------------------------------------------------

export const deliveryMethodSchema = z.enum(['pickup', 'courier', 'post']);

export const createOrderSchema = z.object({
  customerName: trimmedString(2, 100),
  phone: trimmedString(6, 20),
  city: trimmedString(2, 60),
  deliveryMethod: deliveryMethodSchema,
  address: z.string().trim().max(300).optional().or(z.literal('')),
  pickupPoint: z.string().trim().max(200).optional().or(z.literal('')),
  comment: z.string().trim().max(500).optional().or(z.literal('')),
  promocode: trimmedString(3, 32).optional().or(z.literal('')),
});

export const orderStatusSchema = z.object({
  status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']),
});

// ---------------------------------------------------------------------------
// Администрирование
// ---------------------------------------------------------------------------

export const promocodeSchema = z.object({
  code: trimmedString(3, 32).transform((v) => v.toUpperCase()),
  type: z.enum(['percent', 'fixed']).default('percent'),
  value: z.number().positive('Значение должно быть больше нуля'),
  minOrder: moneySchema.default(0),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const expenseSchema = z.object({
  category: z.enum([
    'advertising',
    'logistics',
    'packaging',
    'payment_fee',
    'rent',
    'salary',
    'other',
  ]),
  amount: moneySchema.refine((v) => v > 0, 'Сумма должна быть больше нуля'),
  title: trimmedString(2, 140),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  date: z.string().datetime({ offset: true }).optional(),
});

export const stockSchema = z.object({
  stock: z.number().int().min(0).max(100000),
  purchasePrice: moneySchema.optional(),
});

export const supplierSchema = z.object({
  name: trimmedString(2, 120),
  contactName: trimmedString(2, 120).optional().or(z.literal('')),
  phone: trimmedString(5, 25).optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  country: trimmedString(2, 60).optional(),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export const purchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  number: trimmedString(3, 40).optional(),
  status: z.enum(['draft', 'ordered', 'in_transit', 'received', 'cancelled']).optional(),
  delivery: moneySchema.default(0),
  commission: moneySchema.default(0),
  customs: moneySchema.default(0),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().nullable().optional(),
        name: trimmedString(2, 140),
        quantity: z.number().int().positive(),
        unitCost: moneySchema,
      }),
    )
    .min(1, 'Добавьте хотя бы одну позицию'),
});

// ---------------------------------------------------------------------------
// Фильтры каталога (query-параметры)
// ---------------------------------------------------------------------------

const csvNumber = z
  .string()
  .transform((v) => v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0))
  .optional();

const csvString = z
  .string()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .optional();

export const productQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: csvNumber,
  brand: csvString,
  size: csvString,
  color: csvString,
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  onSale: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  sort: z
    .enum(['newest', 'price_asc', 'price_desc', 'popular', 'rating', 'name'])
    .default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(96).default(12),
});

export const adminProductQuerySchema = productQuerySchema.extend({
  includeInactive: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .default('true'),
  lowStock: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  q: z.string().trim().max(120).optional(),
  status: z
    .enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'])
    .optional(),
});

export const statsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  days: z.coerce.number().int().positive().max(3650).optional(),
});
