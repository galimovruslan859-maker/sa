import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, formatDateTime, formatPrice } from '../services/api';
import { orderApi } from '../services/endpoints';
import type { Order, OrderStatus } from '../services/types';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { toast } from '../store/toast.store';
import { StatusBadge, StatusTrack } from '../components/StatusBadge';
import { Loader } from '../components/Loader';
import './OrderDetailPage.css';

const CANCELLABLE: OrderStatus[] = ['pending'];

/** Детали заказа покупателя: статус, состав, доставка, итоги, действия. */
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const addToCart = useCartStore((s) => s.add);

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await orderApi.detail(Number(id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить заказ');
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/orders/${id}`)}`, { replace: true });
      return;
    }
    void load();
  }, [user, load, navigate, id]);

  async function changeStatus(status: OrderStatus) {
    if (!order || busy) return;
    setBusy(true);
    try {
      const updated = await orderApi.changeStatus(order.id, status);
      setOrder(updated);
      toast.success(
        status === 'paid'
          ? `Заказ ${updated.number} оплачен`
          : `Заказ ${updated.number} отменён, товары возвращены на склад`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  }

  async function repeatOrder() {
    if (!order || busy) return;
    setBusy(true);
    let added = 0;
    let failed = 0;
    for (const item of order.items) {
      try {
        await addToCart(item.variantId, item.quantity);
        added += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    if (added > 0) {
      toast.success(
        failed > 0
          ? `В корзину добавлено ${added} поз., ${failed} недоступны`
          : `Заказ ${order.number} снова в корзине`,
      );
      navigate('/cart');
    } else {
      toast.error('Товары из этого заказа больше недоступны');
    }
  }

  if (loading) return <Loader label="Загружаем заказ…" />;

  if (error || !order) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>Заказ не найден</h1>
        </div>
        <p className="alert alert--error">{error ?? 'Такого заказа нет в вашей истории.'}</p>
        <Link to="/orders" className="btn btn--ghost">
          ← К списку заказов
        </Link>
      </div>
    );
  }

  const canCancel = CANCELLABLE.includes(order.status);
  const canPay = order.status === 'pending';

  return (
    <div className="container">
      <nav className="breadcrumbs" aria-label="Хлебные крошки">
        <Link to="/">Главная</Link> <span aria-hidden>/</span>
        <Link to="/orders">Заказы</Link> <span aria-hidden>/</span>
        <span>{order.number}</span>
      </nav>

      <div className="page-head">
        <div>
          <h1>Заказ {order.number}</h1>
          <p className="page-subtitle">
            Оформлен {formatDateTime(order.createdAt)} · обновлён {formatDateTime(order.updatedAt)}
          </p>
        </div>
        <StatusBadge status={order.status} title={order.statusTitle} />
      </div>

      <div className="order-detail">
        <div className="col order-detail__main">
          {/* ------------------------------ Статус ---------------------------- */}
          <section className="card">
            <h2 className="card-title">Статус заказа</h2>
            <StatusTrack status={order.status} />
            <div className="row order-detail__actions">
              {canPay && (
                <button
                  type="button"
                  className="btn btn--accent"
                  onClick={() => changeStatus('paid')}
                  disabled={busy}
                >
                  Оплатить при получении
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => changeStatus('cancelled')}
                  disabled={busy}
                >
                  Отменить заказ
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost"
                onClick={repeatOrder}
                disabled={busy}
              >
                Повторить заказ
              </button>
            </div>
          </section>

          {/* ------------------------------ Состав ---------------------------- */}
          <section className="card card--flush">
            <h2 className="card-title card-title--padded">Состав заказа</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Вариант</th>
                    <th className="num">Цена</th>
                    <th className="num">Кол-во</th>
                    <th className="num">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="order-detail__product">
                          {item.image ? (
                            <img src={item.image} alt={item.name} loading="lazy" />
                          ) : (
                            <span className="order-detail__thumb" aria-hidden />
                          )}
                          <Link to={`/product/${item.slug ?? item.productId}`}>{item.name}</Link>
                        </div>
                      </td>
                      <td className="muted small">
                        {item.color} · {item.size}
                        {item.sku && <span className="order-detail__sku">{item.sku}</span>}
                      </td>
                      <td className="num">{formatPrice(item.unitPrice)}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">
                        <strong>{formatPrice(item.lineTotal)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ------------------------------ Сводка ------------------------------ */}
        <aside className="col order-detail__aside">
          <section className="card">
            <h2 className="card-title">Итоги</h2>
            <dl className="summary__rows">
              <div>
                <dt>Товары ({order.itemsCount} шт.)</dt>
                <dd>{formatPrice(order.itemsTotal)}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>{order.deliveryCost === 0 ? 'Бесплатно' : formatPrice(order.deliveryCost)}</dd>
              </div>
              {order.discount > 0 && (
                <div>
                  <dt>Скидка {order.promocode ? `(${order.promocode})` : ''}</dt>
                  <dd className="is-discount">−{formatPrice(order.discount)}</dd>
                </div>
              )}
            </dl>
            <div className="summary__total">
              <span>К оплате</span>
              <strong>{formatPrice(order.total)}</strong>
            </div>
            <p className="muted small">Оплата при получении после подтверждения менеджером.</p>
          </section>

          <section className="card">
            <h2 className="card-title">Доставка</h2>
            <dl className="info-rows">
              <div>
                <dt>Способ</dt>
                <dd>{order.deliveryTitle}</dd>
              </div>
              <div>
                <dt>Город</dt>
                <dd>{order.city}</dd>
              </div>
              <div>
                <dt>{order.deliveryMethod === 'pickup' ? 'Пункт выдачи' : 'Адрес'}</dt>
                <dd>{order.deliveryMethod === 'pickup' ? order.pickupPoint : order.address}</dd>
              </div>
              <div>
                <dt>Получатель</dt>
                <dd>{order.customerName}</dd>
              </div>
              <div>
                <dt>Телефон</dt>
                <dd>{order.phone}</dd>
              </div>
            </dl>
            {order.comment && (
              <p className="alert alert--info" style={{ marginTop: 12 }}>
                <strong>Комментарий:</strong> {order.comment}
              </p>
            )}
          </section>

          <Link to="/orders" className="btn btn--ghost btn--block">
            ← Все заказы
          </Link>
        </aside>
      </div>

      <p className="muted small" style={{ marginTop: 18 }}>
        Заказ оформлен {formatDate(order.createdAt)}. По вопросам возврата напишите в поддержку:{' '}
        <a href="mailto:support@resell.ru">support@resell.ru</a>
      </p>
    </div>
  );
}
