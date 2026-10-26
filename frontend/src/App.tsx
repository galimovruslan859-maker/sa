import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ShopLayout } from './layouts/ShopLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { useAuthStore } from './store/auth.store';
import { useCartStore } from './store/cart.store';
import { useFavoriteStore } from './store/favorite.store';

import HomePage from './pages/HomePage';
import CatalogPage from './pages/CatalogPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProfilePage from './pages/ProfilePage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import FavoritesPage from './pages/FavoritesPage';
import NotFoundPage from './pages/NotFoundPage';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminOrders from './pages/admin/AdminOrders';
import AdminUsers from './pages/admin/AdminUsers';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminPromocodes from './pages/admin/AdminPromocodes';
import AdminExpenses from './pages/admin/AdminExpenses';

/** Прокручивает страницу наверх при смене маршрута. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

/** Синхронизация состояния с сервером после восстановления сессии. */
function useSessionSync() {
  const { user, initialized, bootstrap } = useAuthStore();

  useEffect(() => {
    if (!initialized) void bootstrap();
  }, [initialized, bootstrap]);

  useEffect(() => {
    if (!user) {
      useCartStore.getState().reset();
      useFavoriteStore.getState().reset();
      return;
    }
    void useCartStore.getState().fetch();
    void useFavoriteStore.getState().fetch();
  }, [user]);
}

export default function App() {
  useSessionSync();

  return (
    <>
      <ScrollToTop />
      <Routes>
        {/* Публичная часть магазина */}
        <Route element={<ShopLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/product/:id" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/404" element={<NotFoundPage />} />
        </Route>

        {/* Админ-панель (защищена ролью ADMIN) */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="promocodes" element={<AdminPromocodes />} />
          <Route path="expenses" element={<AdminExpenses />} />
        </Route>

        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  );
}
