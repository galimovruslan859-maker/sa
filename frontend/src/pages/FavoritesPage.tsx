import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { favoriteApi } from '../services/endpoints';
import { useAuthStore } from '../store/auth.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import { useQuickAdd } from '../lib/useQuickAdd';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, Loader } from '../components/Loader';

/** Избранные товары текущего пользователя. */
export default function FavoritesPage() {
  const user = useAuthStore((s) => s.user);
  const { items, loading, fetch, toggle } = useFavoriteStore();
  const quickAdd = useQuickAdd();
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (user) void fetch();
  }, [user, fetch]);

  if (!user) return <Navigate to="/login?next=/favorites" replace />;

  async function clearAll() {
    if (items.length === 0 || clearing) return;
    setClearing(true);
    try {
      // удаляем последовательно: API ожидает один товар за запрос
      for (const item of [...items]) {
        await favoriteApi.remove(item.id);
        await toggle(item.id);
      }
      toast.info('Избранное очищено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось очистить избранное');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Избранное</h1>
          <p className="page-subtitle">
            {items.length === 0
              ? 'Здесь появятся товары, которые вы отметили сердцем'
              : `${items.length} ${items.length === 1 ? 'товар' : items.length < 5 ? 'товара' : 'товаров'} сохранено`}
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={clearAll}
            disabled={clearing}
          >
            {clearing ? 'Очищаем…' : 'Очистить список'}
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <Loader label="Загружаем избранное…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Список пуст"
          description="Нажмите на сердечко в карточке товара, чтобы вернуться к нему позже."
          action={
            <Link to="/catalog" className="btn btn--accent">
              Открыть каталог
            </Link>
          }
        />
      ) : (
        <div className="grid-products">
          {items.map((product) => (
            <ProductCard key={product.id} product={product} onQuickAdd={quickAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
