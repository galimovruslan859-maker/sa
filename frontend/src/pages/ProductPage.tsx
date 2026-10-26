import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { favoriteApi, productApi, reviewApi } from '../services/endpoints';
import { formatPrice, formatDate } from '../services/api';
import type { ProductDetails, ProductVariant } from '../services/types';
import { EmptyState, Loader } from '../components/Loader';
import { Rating } from '../components/Rating';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import './ProductPage.css';

const COLOR_HEX: Record<string, string> = {
  Чёрный: '#1c1c1e',
  Белый: '#f8f8f6',
  Бежевый: '#d8c7ab',
  Серый: '#9a9a9a',
  Графит: '#3d4148',
  Хаки: '#6f7a52',
  Синий: '#2f4a7d',
  Голубой: '#7fa8d4',
  'Тёмно-синий': '#22314f',
  Коричневый: '#7a5335',
  Бордовый: '#7c2b34',
  Молочный: '#efe7d8',
  Оливковый: '#7d8a5c',
  Красный: '#c0392b',
  Пудровый: '#e3c3c0',
  Кремовый: '#eadfc9',
  'Тёмно-зелёный': '#2f4f3a',
  Жёлтый: '#e0b13c',
  Мультиколор: '#8e6bb5',
  Серебристый: '#c9ccd1',
};

function hexOf(name: string, fallback?: string) {
  return COLOR_HEX[name] ?? fallback ?? '#cccccc';
}

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.add);
  const favoriteIds = useFavoriteStore((s) => s.ids);
  const refreshFavorites = useFavoriteStore((s) => s.fetch);

  const [product, setProduct] = useState<ProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [color, setColor] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [adding, setAdding] = useState(false);

  // Форма отзыва
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setNotFound(false);
    productApi
      .detail(id)
      .then((data) => {
        if (!alive) return;
        setProduct(data);
        setImageIndex(0);
        const firstColor = data.colors[0]?.name ?? '';
        setColor(firstColor);
        const firstAvailable =
          data.variants.find((v) => v.color === firstColor && v.stock > 0)?.size ??
          data.variants.find((v) => v.color === firstColor)?.size ??
          data.sizes[0] ??
          '';
        setSize(firstAvailable);
        setQuantity(1);
      })
      .catch(() => alive && setNotFound(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  const variant: ProductVariant | null = useMemo(() => {
    if (!product || !size || !color) return null;
    return product.variants.find((v) => v.size === size && v.color === color) ?? null;
  }, [product, size, color]);

  const images = product?.images ?? [];
  const currentImage = images[imageIndex]?.url ?? images[0]?.url ?? null;
  const isFavorite = product ? favoriteIds.includes(product.id) : false;

  const stock = variant?.stock ?? 0;
  const canAdd = Boolean(variant && stock > 0);

  const requireAuth = useCallback(
    (action: string) => {
      toast.info(`Войдите, чтобы ${action}`);
      navigate(`/login?next=${encodeURIComponent(`/product/${id}`)}`);
    },
    [navigate, id],
  );

  async function handleAddToCart() {
    if (!product || !variant) return;
    if (!user) return requireAuth('добавить товар в корзину');
    if (!canAdd) {
      toast.error('Выбранной вариации нет в наличии');
      return;
    }
    setAdding(true);
    try {
      await addToCart(variant.id, quantity);
      toast.success(`«${product.name}» (${size}, ${color}) добавлен в корзину`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось добавить товар');
    } finally {
      setAdding(false);
    }
  }

  async function handleBuyNow() {
    if (!product || !variant) return;
    if (!user) return requireAuth('оформить заказ');
    if (!canAdd) return;
    setAdding(true);
    try {
      await addToCart(variant.id, quantity);
      navigate('/checkout');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось добавить товар');
    } finally {
      setAdding(false);
    }
  }

  async function handleFavorite() {
    if (!product) return;
    if (!user) return requireAuth('добавить в избранное');
    try {
      const added = await favoriteApi.toggle(product.id);
      toast.success(added ? 'Добавлено в избранное' : 'Убрано из избранного');
      await refreshFavorites();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    }
  }

  async function submitReview(event: React.FormEvent) {
    event.preventDefault();
    if (!product || !user) return;
    setReviewBusy(true);
    try {
      const result = await reviewApi.create({
        productId: product.id,
        rating,
        title: reviewTitle || undefined,
        body: reviewBody || undefined,
      });
      setProduct({
        ...product,
        rating: result.productRating,
        reviewsCount: result.reviewsCount,
        reviews: [result.review, ...product.reviews],
      });
      setReviewOpen(false);
      setReviewTitle('');
      setReviewBody('');
      setRating(5);
      toast.success('Спасибо за отзыв!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось отправить отзыв');
    } finally {
      setReviewBusy(false);
    }
  }

  if (loading) return <Loader label="Загружаем товар…" />;

  if (notFound || !product) {
    return (
      <div className="container">
        <EmptyState
          title="Товар не найден"
          description="Возможно, он снят с продажи или ссылка устарела."
          action={
            <Link to="/catalog" className="btn">
              Вернуться в каталог
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container product">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link> <span aria-hidden>/</span>
        <Link to="/catalog">Каталог</Link> <span aria-hidden>/</span>
        <Link to={`/catalog?category=${product.category.id}`}>{product.category.name}</Link>{' '}
        <span aria-hidden>/</span>
        <span>{product.name}</span>
      </div>

      <div className="product__layout">
        {/* ------------------------------- Галерея ------------------------------ */}
        <div className="product__gallery">
          <div className="product__main-image">
            {currentImage ? (
              <img src={currentImage} alt={`${product.name} — ${color}`} />
            ) : (
              <div className="product__no-photo">Нет фото</div>
            )}
            {!product.inStock && <span className="badge badge--danger product__out">Нет в наличии</span>}
          </div>

          {images.length > 1 && (
            <div className="product__thumbs">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  className={`product__thumb ${i === imageIndex ? 'is-active' : ''}`}
                  onClick={() => setImageIndex(i)}
                  aria-label={`Фото ${i + 1}`}
                  aria-current={i === imageIndex}
                >
                  <img src={img.url} alt={img.alt ?? product.name} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* -------------------------------- Инфо -------------------------------- */}
        <div className="product__info">
          <span className="product__brand">{product.brand ?? 'Без бренда'}</span>
          <h1>{product.name}</h1>

          <div className="row product__rating">
            <Rating value={product.rating} readOnly size={16} />
            <span className="muted small">
              {product.reviewsCount > 0
                ? `${product.rating.toFixed(1)} · ${product.reviewsCount} отзыв(ов)`
                : 'Отзывов пока нет'}
            </span>
            <span className="muted small">Арт. {variant?.sku ?? product.slug}</span>
          </div>

          <div className="product__price">{formatPrice(product.price)}</div>

          {/* Цвет */}
          <div className="product__option">
            <div className="row row--between">
              <h4>Цвет</h4>
              <span className="muted small">{color || '—'}</span>
            </div>
            <div className="product__colors">
              {product.colors.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={`product__color ${c.name === color ? 'is-active' : ''}`}
                  onClick={() => {
                    setColor(c.name);
                    const available = product.variants.find((v) => v.color === c.name && v.stock > 0);
                    setSize(available?.size ?? product.variants.find((v) => v.color === c.name)?.size ?? '');
                    setQuantity(1);
                  }}
                  aria-pressed={c.name === color}
                  title={c.name}
                >
                  <span className="swatch" style={{ background: hexOf(c.name, c.hex) }} />
                </button>
              ))}
            </div>
          </div>

          {/* Размер */}
          <div className="product__option">
            <div className="row row--between">
              <h4>Размер</h4>
              <span className="muted small">{size ? `${size} · ${stock} шт. на складе` : 'Выберите размер'}</span>
            </div>
            <div className="product__sizes">
              {product.sizes.map((s) => {
                const v = product.variants.find((x) => x.size === s && x.color === color);
                const disabled = !v || v.stock === 0;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`product__size ${s === size ? 'is-active' : ''}`}
                    disabled={disabled}
                    onClick={() => {
                      setSize(s);
                      setQuantity(1);
                    }}
                    title={disabled ? 'Нет в наличии' : `В наличии ${v?.stock} шт.`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Количество + кнопки */}
          <div className="product__buy">
            <div className="product__qty">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Уменьшить количество"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={Math.max(1, stock)}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, stock)))
                }
                aria-label="Количество"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(Math.max(1, stock), q + 1))}
                disabled={quantity >= stock}
                aria-label="Увеличить количество"
              >
                +
              </button>
            </div>

            <button type="button" className="btn btn--lg" onClick={handleAddToCart} disabled={!canAdd || adding}>
              {canAdd ? 'Добавить в корзину' : 'Нет в наличии'}
            </button>
          </div>

          <div className="row product__secondary">
            <button type="button" className="btn btn--ghost btn--lg" onClick={handleBuyNow} disabled={!canAdd || adding}>
              Купить в 1 клик
            </button>
            <button
              type="button"
              className={`btn btn--ghost btn--icon btn--lg ${isFavorite ? 'btn--accent' : ''}`}
              onClick={handleFavorite}
              aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
              aria-pressed={isFavorite}
            >
              ♥
            </button>
          </div>

          <ul className="product__assurance">
            <li>Доставка по России от 2 дней, бесплатно от 5 000 ₽</li>
            <li>Примерка и возврат в течение 14 дней</li>
            <li>Оплата картой или при получении</li>
          </ul>

          {/* Описание и характеристики */}
          <div className="product__section">
            <h4>Описание</h4>
            <p className="product__description">{product.description ?? 'Описание отсутствует.'}</p>
          </div>

          <div className="product__section">
            <h4>Характеристики</h4>
            <dl className="product__specs">
              {product.composition && (
                <>
                  <dt>Состав</dt>
                  <dd>{product.composition}</dd>
                </>
              )}
              <dt>Категория</dt>
              <dd>{product.category.name}</dd>
              {Object.entries(product.specs ?? {}).map(([key, value]) => (
                <div key={key} className="product__spec-row">
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <dt>Доступные размеры</dt>
              <dd>{product.sizes.join(', ')}</dd>
            </dl>
          </div>
        </div>
      </div>

      {/* -------------------------------- Отзывы ------------------------------- */}
      <section className="product__reviews">
        <div className="page-head">
          <div>
            <h2>Отзывы покупателей</h2>
            <p className="page-subtitle">
              {product.reviews.length > 0
                ? `Средняя оценка ${product.rating.toFixed(1)} из 5 на основе ${product.reviews.length} отзыв(ов)`
                : 'Оставьте первый отзыв об этом товаре'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              if (!user) return requireAuth('оставить отзыв');
              setReviewOpen((v) => !v);
            }}
          >
            {reviewOpen ? 'Скрыть форму' : 'Написать отзыв'}
          </button>
        </div>

        {reviewOpen && (
          <form className="card review-form" onSubmit={submitReview}>
            <div className="field">
              <label htmlFor="review-rating">Ваша оценка</label>
              <Rating value={rating} onChange={setRating} />
            </div>
            <div className="field">
              <label htmlFor="review-title">Заголовок</label>
              <input
                id="review-title"
                className="input"
                value={reviewTitle}
                maxLength={120}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="Например: отличное качество"
              />
            </div>
            <div className="field">
              <label htmlFor="review-body">Комментарий</label>
              <textarea
                id="review-body"
                className="textarea"
                value={reviewBody}
                maxLength={2000}
                onChange={(e) => setReviewBody(e.target.value)}
                placeholder="Поделитесь впечатлениями: посадка, качество ткани, соответствие размеру"
              />
              <span className="hint">
                Отзыв могут оставить только покупатели, заказавшие этот товар.
              </span>
            </div>
            <button type="submit" className="btn" disabled={reviewBusy}>
              {reviewBusy ? 'Отправляем…' : 'Опубликовать отзыв'}
            </button>
          </form>
        )}

        {product.reviews.length === 0 ? (
          <div className="card">
            <p className="muted small" style={{ margin: 0 }}>
              Отзывов пока нет. После доставки заказа вы сможете оценить товар — ссылка появится в
              разделе «Мои заказы».
            </p>
          </div>
        ) : (
          <div className="reviews">
            {product.reviews.map((r) => (
              <article key={r.id} className="card review">
                <header className="row row--between">
                  <div>
                    <strong>{r.author}</strong>
                    <div className="xs muted">{formatDate(r.createdAt)}</div>
                  </div>
                  <Rating value={r.rating} readOnly size={15} />
                </header>
                {r.title && <h4 className="review__title">{r.title}</h4>}
                {r.body && <p className="review__body">{r.body}</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------ Похожие ------------------------------- */}
      {product.related.length > 0 && (
        <section className="product__related">
          <div className="page-head">
            <h2>С этим товаром покупают</h2>
            <Link to={`/catalog?category=${product.category.id}`} className="btn btn--ghost btn--sm">
              Все в категории «{product.category.name}»
            </Link>
          </div>
          <div className="grid-products">
            {product.related.slice(0, 4).map((rel) => (
              <article key={rel.id} className="product-card">
                <Link to={`/product/${rel.id}`} className="product-card__link">
                  <div className="product-card__media">
                    {rel.image ? (
                      <img src={rel.image} alt={rel.name} loading="lazy" />
                    ) : (
                      <div className="product-card__no-photo">Нет фото</div>
                    )}
                  </div>
                  <div className="product-card__body">
                    <span className="product-card__brand">{rel.brand ?? 'Без бренда'}</span>
                    <h3 className="product-card__name">{rel.name}</h3>
                    <div className="product-card__footer">
                      <span className="product-card__price">{formatPrice(rel.price)}</span>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
