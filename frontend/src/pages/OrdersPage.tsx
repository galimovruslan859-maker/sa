import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { formatDate, formatPrice } from '../services/api';
import { orderApi } from '../services/endpoints';
import type { Order, OrderStatus, Pagination } from '../services/types';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../store/toast.store';
import { StatusBadge, STATUS_META } from '../components/StatusBadge';
import { EmptyState, Loader } from '../components/Loader';
import { PaginationNav } from '../components/Pagination';
import './OrdersPage.css';

const FILTERS: Array<{ id: OrderStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'pending', label: STATUS_META.pending.title },
  { id: 'paid', label: STATUS_META.paid.title },
  { id: 'processing', label: STATUS_META.processing.title },
  { id: 'shipped', label: STATUS_META.shipped.title },
  { id: 'delivered', label: STATUS_META.delivered.title },
  { id: 'cancelled', label: STATUS_META.cancelled.title },
];

const PER_PAGE = 10;

/** История заказов покупателя с фильтром по статусу. */
export default function OrdersPage() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();

  const statusParam = params.get('status') as OrderStatus | null;
  const status = statusParam && STATUS_META[statusParam] ? statusParam : undefined;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await orderApi.mine({ page, limit: PER_PAGE, status });
      setOrders(data.items);
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  if (!user) return <Navigate to="/login?next=/orders" replace />;

  function updateParams(next: Record<string, string | null>) {
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') search.delete(key);
      else search.set(key, value);
    }
    setParams(search, { replace: true });
  }

  async function cancel(order: Order) {
    if (busyId) return;
    setBusyId(order.id);
    try {
      const updated = await orderApi.changeStatus(order.id, 'cancelled');
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast.info(`Заказ ${order.number} отменён`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось отменить заказ');
    } finally {
      setBusyId(null);
    }
  }

  const summary = orders.reduce((acc, o) => acc + (o.status === 'cancelled' ? 0 : o.total), 0);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Мои заказы</h1>
          <p className="page-subtitle">
            {pagination
              ? `${pagination.total} ${pagination.total === 1 ? 'заказ' : pagination.total < 5 ? 'заказа' : 'заказов'} в истории`
              : 'История покупок и статусы доставки'}
          </p>
        </div>
        <Link to="/catalog" className="btn btn--ghost">
          Продолжить покупки
        </Link>
      </div>

      <div className="orders-filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`chip ${status === filter.id || (filter.id === 'all' && !status) ? 'active' : ''}`}
            onClick={() =>
              updateParams({ status: filter.id === 'all' ? null : filter.id, page: null })
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Loader label="Загружаем заказы…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title={status ? 'Заказов с таким статусом нет' : 'Заказов пока нет'}
          description="Оформите первую покупку — заказы и их статусы появятся здесь."
          action={
            <Link to="/catalog" className="btn btn--accent">
              Перейти в каталог
            </Link>
          }
        />
      ) : (
        <>
          <div className="col orders-list">
            {orders.map((order) => (
              <article key={order.id} className="order-card card">
                <header className="order-card__head">
                  <div>
                    <Link to={`/orders/${order.id}`} className="order-card__number">
                      {order.number}
                    </Link>
                    <p className="muted small">
                      {formatDate(order.createdAt)} · {order.itemsCount} шт. · {order.deliveryTitle}
                    </p>
                  </div>
                  <StatusBadge status={order.status} title={order.statusTitle} />
                </header>

                <div className="order-card__thumbs">
                  {order.items.slice(0, 6).map((item) => (
                    <span key={item.id} className="order-card__thumb" title={`${item.name} (${item.size}, ${item.color})`}>
                      {item.image ? (
                        <img src={item.image} alt={item.name} loading="lazy" />
                      ) : (
                        <i aria-hidden />
                      )}
                      {item.quantity > 1 && <em>×{item.quantity}</em>}
                    </span>
                  ))}
                  {order.items.length > 6 && (
                    <span className="order-card__more">+{order.items.length - 6}</span>
                  )}
                </div>

                <footer className="order-card__foot">
                  <div className="order-card__total">
                    <span className="muted small">Сумма заказа</span>
                    <strong>{formatPrice(order.total)}</strong>
                  </div>
                  <div className="row">
                    {order.status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => cancel(order)}
                        disabled={busyId === order.id}
                      >
                        {busyId === order.id ? 'Отменяем…' : 'Отменить'}
                      </button>
                    )}
                    <Link to={`/orders/${order.id}`} className="btn btn--sm">
                      Подробнее
                    </Link>
                  </div>
                </footer>
              </article>
            ))}
          </div>

          <p className="muted small orders-sum">
            Сумма активных заказов на странице: <strong>{formatPrice(summary)}</strong>
          </p>

          {pagination && (
            <PaginationNav pagination={pagination} onChange={(p) => updateParams({ page: String(p) })} />
          )}
        </>
      )}
    </div>
  );
}
