import { api, buildQuery } from './api';
import type {
  AdminProduct,
  AdminProductListResponse,
  AdminUser,
  Cart,
  Category,
  CheckoutPreview,
  DeliveryMethod,
  Expense,
  Facets,
  Order,
  OrderStatus,
  Pagination,
  Product,
  ProductDetails,
  ProductListResponse,
  ProfitReport,
  Promocode,
  Purchase,
  Review,
  Statistics,
  Supplier,
  User,
} from './types';

type QueryValue = string | number | boolean | undefined | null | Array<string | number>;

// --------------------------------- Auth ----------------------------------

export const authApi = {
  register: (body: { email: string; password: string; firstName: string; lastName?: string; phone?: string }) =>
    api.post<{ token: string; user: User }>('/auth/register', body),

  login: (body: { email: string; password: string }) =>
    api.post<{ token: string; user: User }>('/auth/login', body),

  me: () =>
    api.get<{
      user: User;
      stats: { ordersCount: number; favoritesCount: number; reviewsCount: number; cartCount: number };
    }>('/auth/me'),

  updateMe: (body: { firstName?: string; lastName?: string; phone?: string; password?: string }) =>
    api.put<{ user: User }>('/auth/me', body),

  logout: () => api.post<{ success: boolean }>('/auth/logout'),
};

// -------------------------------- Каталог ---------------------------------

export interface ProductQuery {
  q?: string;
  category?: number[];
  brand?: string[];
  size?: string[];
  color?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'rating' | 'name';
  page?: number;
  limit?: number;
}

export const productApi = {
  list: (query: ProductQuery = {}) =>
    api.get<ProductListResponse>(`/products${buildQuery(query as Record<string, QueryValue>)}`),

  detail: (idOrSlug: string | number) => api.get<ProductDetails>(`/products/${idOrSlug}`),

  facets: () => api.get<Facets>('/products/facets'),

  newest: (limit = 8) => api.get<{ items: Product[] }>(`/products/new${buildQuery({ limit })}`),

  reviews: (id: number) =>
    api.get<{
      productId: number;
      rating: number;
      count: number;
      distribution: Array<{ star: number; count: number }>;
      items: Review[];
    }>(`/products/${id}/reviews`),
};

export const categoryApi = {
  list: () => api.get<{ items: Category[]; total: number }>('/categories'),
};

// -------------------------------- Корзина ---------------------------------

export const cartApi = {
  get: () => api.get<Cart>('/cart'),
  add: (variantId: number, quantity = 1) => api.post<Cart>('/cart', { variantId, quantity }),
  update: (id: number, quantity: number) => api.put<Cart>(`/cart/${id}`, { quantity }),
  remove: (id: number) => api.delete<Cart>(`/cart/${id}`),
  clear: () => api.delete<Cart>('/cart'),
};

// --------------------------------- Заказы ---------------------------------

export interface CheckoutPayload {
  customerName: string;
  phone: string;
  city: string;
  deliveryMethod: DeliveryMethod;
  address?: string;
  pickupPoint?: string;
  comment?: string;
  promocode?: string;
}

export const orderApi = {
  checkoutPreview: (deliveryMethod: DeliveryMethod, promocode?: string) =>
    api.get<CheckoutPreview>(`/orders/checkout-preview${buildQuery({ deliveryMethod, promocode })}`),

  create: (payload: CheckoutPayload) => api.post<Order>('/orders', payload),

  mine: (query: { page?: number; limit?: number; status?: OrderStatus } = {}) =>
    api.get<{ items: Order[]; pagination: Pagination }>(`/orders${buildQuery(query as Record<string, QueryValue>)}`),

  detail: (id: number) => api.get<Order>(`/orders/${id}`),

  changeStatus: (id: number, status: OrderStatus) => api.put<Order>(`/orders/${id}/status`, { status }),

  deliveryOptions: () =>
    api.get<{
      items: Array<{ id: DeliveryMethod; name: string; priceCents: number; days: string; freeFromCents?: number }>;
    }>('/orders/delivery-options'),
};

// ------------------------------- Избранное --------------------------------

export const favoriteApi = {
  list: () => api.get<{ items: Array<Product & { addedAt: string }>; total: number }>('/favorites'),
  ids: () => api.get<{ ids: number[] }>('/favorites/ids'),
  toggle: (productId: number) => api.post<{ favorite: boolean; productId: number }>('/favorites', { productId }),
  remove: (productId: number) => api.delete<{ favorite: boolean }>(`/favorites/${productId}`),
};

// --------------------------------- Отзывы ---------------------------------

export const reviewApi = {
  create: (body: { productId: number; rating: number; title?: string; body?: string }) =>
    api.post<{ review: Review; productRating: number; reviewsCount: number }>('/reviews', body),
  mine: () => api.get<{ items: Array<Review & { product: { id: number; name: string; slug: string } }> }>('/reviews/mine'),
  remove: (id: number) => api.delete<{ success: boolean }>(`/reviews/${id}`),
};

// --------------------------------- Админка --------------------------------

export interface ProductPayload {
  name?: string;
  slug?: string;
  description?: string;
  brand?: string;
  categoryId?: number;
  supplierId?: number | null;
  composition?: string;
  specs?: Record<string, string>;
  sizes?: string[];
  colors?: Array<{ name: string; hex?: string }>;
  price?: number;
  finance?: Partial<{
    purchasePrice: number;
    deliveryCost: number;
    commission: number;
    customs: number;
    packaging: number;
    paymentFee: number;
    advertising: number;
  }>;
  images?: Array<{ url: string; alt?: string }>;
  variants?: Array<{ size: string; color: string; stock: number }>;
  isActive?: boolean;
}

export const adminApi = {
  statistics: (days?: number) => api.get<Statistics>(`/admin/statistics${buildQuery({ days })}`),
  profit: () => api.get<ProfitReport>('/admin/profit'),

  products: (query: Record<string, QueryValue> = {}) =>
    api.get<AdminProductListResponse>(`/admin/products${buildQuery(query)}`),
  product: (id: number) => api.get<AdminProduct>(`/admin/products/${id}`),
  createProduct: (payload: ProductPayload) => api.post<AdminProduct>('/admin/products', payload),
  updateProduct: (id: number, payload: ProductPayload) => api.put<AdminProduct>(`/admin/products/${id}`, payload),
  deleteProduct: (id: number) =>
    api.delete<{ success: boolean; deleted: boolean; message: string }>(`/admin/products/${id}`),
  updateStock: (productId: number, variantId: number, stock: number) =>
    api.put<AdminProduct>(`/admin/products/${productId}/variants/${variantId}/stock`, { stock }),
  updateStockBulk: (productId: number, items: Array<{ variantId: number; stock: number }>) =>
    api.put<AdminProduct>(`/admin/products/${productId}/stock`, { items }),

  categories: () => api.get<{ items: Category[]; total: number }>('/admin/categories'),
  createCategory: (payload: Partial<Category>) => api.post<Category>('/admin/categories', payload),
  updateCategory: (id: number, payload: Partial<Category>) => api.put<Category>(`/admin/categories/${id}`, payload),
  deleteCategory: (id: number) => api.delete<{ success: boolean }>(`/admin/categories/${id}`),

  orders: (query: Record<string, QueryValue> = {}) =>
    api.get<{ items: Order[]; pagination: Pagination }>(`/admin/orders${buildQuery(query)}`),
  order: (id: number) => api.get<Order>(`/admin/orders/${id}`),
  updateOrderStatus: (id: number, status: OrderStatus) =>
    api.put<Order>(`/admin/orders/${id}/status`, { status }),

  users: (query: Record<string, QueryValue> = {}) =>
    api.get<{ items: AdminUser[]; pagination: Pagination }>(`/admin/users${buildQuery(query)}`),
  updateUser: (id: number, payload: { role?: 'CUSTOMER' | 'ADMIN'; isActive?: boolean }) =>
    api.put<AdminUser>(`/admin/users/${id}`, payload),

  promocodes: () => api.get<{ items: Promocode[]; total: number }>('/admin/promocodes'),
  createPromocode: (payload: Record<string, unknown>) => api.post<Promocode>('/admin/promocodes', payload),
  updatePromocode: (id: number, payload: Record<string, unknown>) => api.put<Promocode>(`/admin/promocodes/${id}`, payload),
  deletePromocode: (id: number) =>
    api.delete<{ success: boolean; deleted: boolean; message?: string }>(`/admin/promocodes/${id}`),

  expenses: () => api.get<{ items: Expense[]; total: number }>('/admin/expenses'),
  createExpense: (payload: Record<string, unknown>) => api.post<Expense>('/admin/expenses', payload),
  deleteExpense: (id: number) => api.delete<{ success: boolean }>(`/admin/expenses/${id}`),

  suppliers: () => api.get<{ items: Supplier[]; total: number }>('/admin/suppliers'),
  createSupplier: (payload: Record<string, unknown>) => api.post<Supplier>('/admin/suppliers', payload),
  deleteSupplier: (id: number) => api.delete<{ success: boolean }>(`/admin/suppliers/${id}`),

  purchases: () => api.get<{ items: Purchase[]; total: number }>('/admin/purchases'),
  createPurchase: (payload: Record<string, unknown>) => api.post<Purchase>('/admin/purchases', payload),
  updatePurchaseStatus: (id: number, status: Purchase['status']) =>
    api.put<Purchase>(`/admin/purchases/${id}/status`, { status }),

  uploadImages: (files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('images', file);
    return api.upload<{ items: Array<{ url: string; filename: string; size: number }> }>('/admin/uploads/products', form);
  },
};
