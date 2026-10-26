import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cart.store';
import { useAuthStore } from '../store/auth.store';
import { formatPrice } from '../services/api';
import { EmptyState, Loader } from '../components/Loader';
import { toast } from '../store/toast.store';
import './CartPage.css';

export default function CartPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { items, itemsTotal, count, loading, error, fetch, update, remove, clear, setError } =
    useCartStore();
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (user && !loading) void fetch();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="container">
        <EmptyState
          title="Войдите, чтобы увидеть корзину"
          description="Корзина хранится на сервере и привязана к вашему аккаунту — товары не потеряются при смене устройства."
          action={
            <div className="row">
              <Link to="/login?next=/cart" className="btn">
                Войти
              </Link>
              <Link to="/register" className="btn btn--ghost">
                Зарегистрироваться
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (loading && items.length === 0) return <Loader label="Загружаем корзину…" />;

  if (items.length === 0) {
    return (
      <div className="container">
        <h1>Корзина</h1>
        <EmptyState
          title="В корзине пока пусто"
          description="Загляните в каталог — там 26 моделей одежды, обуви и аксессуаров."
          action={
            <Link to="/catalog" className="btn">
              Перейти в каталог
            </Link>
          }
        />
      </div>
    );
  }

  async function changeQuantity(id: number, quantity: number) {
    if (quantity < 1) return;
    setBusyId(id);
    try {
      await update(id, quantity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить количество');
    } finally {
      setBusyId(null);
    }
  }

  async function removeItem(id: number, name: string) {
    setBusyId(id);
    try {
      await remove(id);
      toast.info(`«${name}» удалён из корзины`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить позицию');
    } finally {
      setBusyId(null);
    }
  }

  const deliveryFreeFrom = 5000;
  const missing = Math.max(0, deliveryFreeFrom - itemsTotal);

  return (
    <div className="container cart">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link> <span aria-hidden>/</span> <span>Корзина</span>
      </div>

      <div className="page-head">
        <div>
          <h1>Корзина</h1>
          <p className="page-subtitle">
            {count} товар(ов) · проверьте размер и цвет перед оформлением
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await clear();
            toast.info('Корзина очищена');
          }}
        >
          Очистить корзину
        </button>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => setError(null)}>
            скрыть
          </button>
        </div>
      )}

      <div className="cart__layout">
        <div className="cart__items">
          {items.map((item) => (
            <article key={item.id} className={`cart-item ${busyId === item.id ? 'is-busy' : ''}`}>
              <Link to={`/product/${item.productId}`} className="cart-item__image">
                {item.image ? (
                  <img src={item.image} alt={item.name} loading="lazy" />
                ) : (
                  <div className="product__no-photo">Нет фото</div>
                )}
              </Link>

              <div className="cart-item__body">
                <div className="cart-item__head">
                  <div>
                    <span className="cart-item__brand">{item.brand ?? 'Без бренда'}</span>
                    <Link to={`/product/${item.productId}`} className="cart-item__name">
                      {item.name}
                    </Link>
                    <div className="cart-item__meta xs muted">
                      Размер: <strong>{item.size}</strong> · Цвет: <strong>{item.color}</strong>
                      <span className="cart-item__sku">Арт. {item.sku}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cart-item__remove"
                    aria-label={`Удалить ${item.name}`}
                    onClick={() => removeItem(item.id, item.name)}
                  >
                    ✕
                  </button>
                </div>

                <div className="cart-item__foot">
                  <div className="product__qty">
                    <button
                      type="button"
                      onClick={() => changeQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1 || busyId === item.id}
                      aria-label="Уменьшить"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      min={1}
                      max={item.available}
                      onChange={(e) => changeQuantity(item.id, Number(e.target.value) || 1)}
                      aria-label={`Количество: ${item.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => changeQuantity(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.available || busyId === item.id}
                      aria-label="Увеличить"
                    >
                      +
                    </button>
                  </div>

                  <div className="cart-item__price">
                    <span className="cart-item__unit xs muted">
                      {formatPrice(item.unitPrice)} × {item.quantity}
                    </span>
                    <strong>{formatPrice(item.lineTotal)}</strong>
                  </div>
                </div>

                {item.quantity >= item.available && (
                  <p className="xs cart-item__warn">
                    На складе осталось {item.available} шт. — больше добавить не получится.
                  </p>
                )}
                {!item.isActive && (
                  <p className="xs cart-item__warn">Товар снят с продажи — удалите позицию.</p>
                )}
              </div>
            </article>
          ))}
        </div>

        <aside className="cart__summary">
          <div className="card">
            <h3 className="card-title">Ваш заказ</h3>

            <dl className="summary__rows">
              <div>
                <dt>Товары ({count})</dt>
                <dd>{formatPrice(itemsTotal)}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd className="muted">рассчитаем на следующем шаге</dd>
              </div>
            </dl>

            {missing > 0 && (
              <p className="summary__hint">
                Добавьте ещё на <strong>{formatPrice(missing)}</strong> — и доставка курьером станет
                бесплатной.
              </p>
            )}

            <div className="summary__total">
              <span>Итого</span>
              <strong>{formatPrice(itemsTotal)}</strong>
            </div>

            <button type="button" className="btn btn--lg btn--block" onClick={() => navigate('/checkout')}>
              Оформить заказ
            </button>
            <Link to="/catalog" className="btn btn--ghost btn--block" style={{ marginTop: 8 }}>
              Продолжить покупки
            </Link>

            <p className="xs muted" style={{ marginTop: 12 }}>
              На шаге оформления можно применить промокод, например <strong>RESELL10</strong> (−10%).
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
