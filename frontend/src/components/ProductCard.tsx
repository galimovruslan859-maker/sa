import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Product } from '../services/types';
import { formatPrice } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import './ProductCard.css';

interface Props {
  product: Product;
  onQuickAdd?: (product: Product) => void;
}

/** Карточка товара в каталоге: фото, бренд, название, цена, избранное. */
export function ProductCard({ product, onQuickAdd }: Props) {
  const user = useAuthStore((s) => s.user);
  const favoriteIds = useFavoriteStore((s) => s.ids);
  const toggleFavorite = useFavoriteStore((s) => s.toggle);
  const [busy, setBusy] = useState(false);

  const isFavorite = favoriteIds.includes(product.id);
  const image = product.images[0]?.url ?? null;
  const discount = product.totalStock === 0;

  async function handleFavorite(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      toast.info('Войдите, чтобы добавлять товары в избранное');
      return;
    }
    try {
      const added = await toggleFavorite(product.id);
      toast.success(added ? 'Добавлено в избранное' : 'Убрано из избранного');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить избранное');
    }
  }

  function handleQuickAdd(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    onQuickAdd?.(product);
    setTimeout(() => setBusy(false), 400);
  }

  return (
    <article className="product-card">
      <Link to={`/product/${product.id}`} className="product-card__link">
        <div className="product-card__media">
          {image ? (
            <img src={image} alt={product.images[0]?.alt ?? product.name} loading="lazy" />
          ) : (
            <div className="product-card__no-photo">Нет фото</div>
          )}

          <div className="product-card__flags">
            {!product.inStock && <span className="badge badge--danger">Нет в наличии</span>}
            {product.inStock && product.totalStock <= 5 && (
              <span className="badge badge--warn">Заканчивается</span>
            )}
            {discount && null}
            {product.rating > 0 && (
              <span className="badge badge--dark">★ {product.rating.toFixed(1)}</span>
            )}
          </div>

          <button
            type="button"
            className={`product-card__fav ${isFavorite ? 'is-active' : ''}`}
            aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
            aria-pressed={isFavorite}
            onClick={handleFavorite}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden>
              <path
                d="M12 20.7 4.6 13.4a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 1 1 6.8 6.8Z"
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </svg>
          </button>

          {onQuickAdd && product.inStock && (
            <button
              type="button"
              className="product-card__quick btn btn--sm"
              onClick={handleQuickAdd}
              disabled={busy}
            >
              Быстрый заказ
            </button>
          )}
        </div>

        <div className="product-card__body">
          <span className="product-card__brand">{product.brand ?? 'Без бренда'}</span>
          <h3 className="product-card__name">{product.name}</h3>
          <div className="product-card__meta">
            <span className="product-card__category">{product.category.name}</span>
            <span className="product-card__colors">
              {product.colors.slice(0, 4).map((c) => (
                <span
                  key={c.name}
                  className="swatch"
                  title={c.name}
                  style={{ background: c.hex ?? '#cccccc' }}
                />
              ))}
              {product.colors.length > 4 && <span className="xs muted">+{product.colors.length - 4}</span>}
            </span>
          </div>
          <div className="product-card__footer">
            <span className="product-card__price">{formatPrice(product.price)}</span>
            <span className="product-card__sizes xs muted">
              {product.sizes.slice(0, 4).join(' · ')}
              {product.sizes.length > 4 ? '…' : ''}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
