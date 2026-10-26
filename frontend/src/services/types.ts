// ---------------------------------------------------------------------------
// Типы данных, которыми обмениваются frontend и backend.
// Финансовые поля (finance, financeCents) присутствуют ТОЛЬКО в админских DTO.
// ---------------------------------------------------------------------------

export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productsCount: number;
}

export interface ProductImage {
  id: number;
  url: string;
  alt: string | null;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
}

export interface ProductColor {
  name: string;
  hex?: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  category: { id: number; name: string; slug: string };
  composition: string | null;
  specs: Record<string, string>;
  sizes: string[];
  colors: ProductColor[];
  price: number;
  priceCents: number;
  inStock: boolean;
  totalStock: number;
  rating: number;
  reviewsCount: number;
  images: ProductImage[];
  variants: ProductVariant[];
  isActive: boolean;
  createdAt: string;
}

export interface ProductFinance {
  purchasePrice: number;
  deliveryCost: number;
  commission: number;
  customs: number;
  packaging: number;
  paymentFee: number;
  advertising: number;
  cost: number;
  price: number;
  profit: number;
  margin: number;
  soldUnits: number;
  totalProfit: number;
}

export interface AdminProduct extends Product {
  supplier: { id: number; name: string } | null;
  finance: ProductFinance;
}

export interface Review {
  id: number;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string;
  author: string;
}

export interface ProductDetails extends Product {
  reviews: Review[];
  related: Array<{ id: number; name: string; slug: string; brand: string | null; price: number; image: string | null }>;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ProductListResponse {
  items: Product[];
  pagination: Pagination;
}

export interface AdminProductListResponse {
  items: AdminProduct[];
  pagination: Pagination;
}

export interface Facets {
  categories: Array<{ id: number; name: string; slug: string; count: number }>;
  brands: string[];
  sizes: string[];
  colors: string[];
  price: { min: number; max: number };
}

// --------------------------------- Корзина --------------------------------

export interface CartItem {
  id: number;
  variantId: number;
  productId: number;
  name: string;
  slug: string;
  brand: string | null;
  size: string;
  color: string;
  sku: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  available: number;
  lineTotal: number;
  lineTotalCents: number;
  isActive: boolean;
}

export interface DeliveryOption {
  id: 'pickup' | 'courier' | 'post';
  name: string;
  days: string;
  price: number;
  priceCents: number;
  freeFrom: number | null;
}

export interface Cart {
  items: CartItem[];
  count: number;
  itemsTotal: number;
  itemsTotalCents: number;
  created?: boolean;
  delivery?: DeliveryOption[];
}

export interface CheckoutPreview {
  deliveryMethod: 'pickup' | 'courier' | 'post';
  items: Array<{
    id: number;
    name: string;
    size: string;
    color: string;
    image: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  itemsCount: number;
  itemsTotal: number;
  itemsTotalCents: number;
  deliveryCost: number;
  deliveryCostCents: number;
  discount: number;
  discountCents: number;
  promocode: string | null;
  promocodeError: string | null;
  total: number;
  totalCents: number;
}

// --------------------------------- Заказы ---------------------------------

export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type DeliveryMethod = 'pickup' | 'courier' | 'post';

export interface OrderItem {
  id: number;
  productId: number;
  variantId: number;
  name: string;
  slug: string | null;
  size: string;
  color: string;
  sku: string | null;
  image: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  lineTotalCents: number;
}

export interface AdminOrderItem extends OrderItem {
  unitCost: number;
  lineCost: number;
  lineProfit: number;
}

export interface OrderFinance {
  revenue: number;
  cost: number;
  deliveryIncome: number;
  profit: number;
  margin: number;
}

export interface Order {
  id: number;
  number: string;
  status: OrderStatus;
  statusTitle: string;
  customerName: string;
  phone: string;
  city: string;
  address: string | null;
  pickupPoint: string | null;
  deliveryMethod: DeliveryMethod;
  deliveryTitle: string;
  comment: string | null;
  promocode: string | null;
  items: OrderItem[] | AdminOrderItem[];
  itemsTotal: number;
  deliveryCost: number;
  discount: number;
  total: number;
  totalCents: number;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
  finance?: OrderFinance;
  user?: { id: number; firstName: string; lastName: string | null; email: string };
}

// ------------------------------- Админка ----------------------------------

export interface Statistics {
  range: { from: string | null; to: string | null };
  orders: {
    total: number;
    paid: number;
    cancelled: number;
    byStatus: Array<{ status: OrderStatus; count: number; sum: number }>;
    averageCheck: number;
    unitsSold: number;
  };
  finance: {
    revenue: number;
    grossRevenue: number;
    deliveryIncome: number;
    discounts: number;
    cost: number;
    expenses: number;
    profit: number;
    margin: number;
    grossMargin: number;
    expensesByCategory: Array<{ category: string; amount: number }>;
  };
  catalog: {
    activeProducts: number;
    totalStockUnits: number;
    variantCount: number;
    customers: number;
  };
  allTime: { revenue: number; cost: number; profit: number };
  daily: Array<{ date: string; revenue: number; profit: number; orders: number }>;
  bestSellers: SalesRow[];
  lowSales: SalesRow[];
  lowStock: LowStock;
}

export interface SalesRow {
  productId: number;
  name: string;
  slug: string | null;
  category: string | null;
  image: string | null;
  price: number;
  unitsSold: number;
  revenue: number;
  profit: number;
  stock: number;
  isActive: boolean;
}

export interface LowStock {
  threshold: number;
  variants: Array<{
    variantId: number;
    sku: string;
    size: string;
    color: string;
    stock: number;
    product: { id: number; name: string; slug: string; isActive: boolean };
  }>;
  outOfStockProducts: Array<{ id: number; name: string; slug: string }>;
}

export interface ProfitRow {
  productId: number;
  name: string;
  category: string;
  supplier: string | null;
  stock: number;
  purchasePrice: number;
  deliveryCost: number;
  commission: number;
  customs: number;
  packaging: number;
  paymentFee: number;
  advertising: number;
  cost: number;
  price: number;
  profit: number;
  margin: number;
  unitsSold: number;
  totalProfit: number;
  isActive: boolean;
}

export interface ProfitReport {
  items: ProfitRow[];
  totals: { cost: number; price: number; profit: number; totalProfit: number; unitsSold: number; stock: number };
}

export interface AdminUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  createdAt: string;
  ordersCount: number;
  reviewsCount: number;
  favoritesCount: number;
  totalSpent: number;
}

export interface Promocode {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minOrder: number;
  maxUses: number | null;
  usedCount: number;
  leftUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Expense {
  id: number;
  category: string;
  amount: number;
  title: string;
  note: string | null;
  date: string;
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  note: string | null;
  createdAt: string;
  _count?: { products: number; purchases: number };
}

export interface Purchase {
  id: number;
  number: string;
  status: 'draft' | 'ordered' | 'in_transit' | 'received' | 'cancelled';
  supplier: { id: number; name: string };
  orderDate: string;
  receivedAt: string | null;
  total: number;
  delivery: number;
  commission: number;
  customs: number;
  totalWithCosts: number;
  note: string | null;
  items: Array<{
    id: number;
    productId: number | null;
    name: string;
    quantity: number;
    unitCost: number;
    sum: number;
  }>;
}

export const PURCHASE_STATUS_TITLES: Record<Purchase['status'], string> = {
  draft: 'Черновик',
  ordered: 'Заказана',
  in_transit: 'В пути',
  received: 'Получена',
  cancelled: 'Отменена',
};

export interface ApiError {
  message: string;
  status: number;
  details?: Array<{ field: string; message: string }> | unknown;
}
