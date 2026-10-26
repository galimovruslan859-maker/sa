import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { toast } from '../store/toast.store';
import type { Product, ProductVariant } from '../services/types';

function pickVariant(product: Product): ProductVariant | null {
  return product.variants.find((v) => v.stock > 0) ?? null;
}

/**
 * Быстрое добавление товара в корзину из карточки в каталоге.
 * Если пользователь не авторизован — уводим на страницу входа.
 */
export function useQuickAdd() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const add = useCartStore((s) => s.add);

  return useCallback(
    async (product: Product) => {
      if (!user) {
        toast.info('Войдите, чтобы добавить товар в корзину');
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
        return;
      }

      const variant = pickVariant(product);
      if (!variant) {
        toast.error('Товара нет в наличии');
        return;
      }

      try {
        await add(variant.id, 1);
        toast.success(`«${product.name}» (${variant.size}, ${variant.color}) — в корзине`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось добавить товар в корзину');
      }
    },
    [user, add, navigate, location],
  );
}
