import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime, formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { AdminOrderItem, Order, OrderStatus, Pagination } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { PaginationNav } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { StatusBadge, STATUS_META } from '../../components/StatusBadge';
import './Admin.css';

const PER_PAGE = 15;

const STATUSES: Array<OrderStatus | 'all'> = [
  'all',
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

/** Следующие логичные статусы для перехода. */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'processing', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: ['pending'],
};

function asAdminItems(order: Order): AdminOrderItem[] {
  return order.items as AdminOrderItem[];
}

/** Заказы: список, фильтр по статусу, детали с финансами, смена статуса. */
export default function AdminOrders() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const statusParam = params.get('status') as OrderStatus | null;
  const status = statusParam && STATUS_META[statusParam] ? statusParam : undefined;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);

  const [detail, setDetail] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.orders({ q: q || undefined, status, page, limit: PER_PAGE });
      setOrders(data.items);
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить заказы');
    } finally {
      setLoading(false);
    }
  }, [q, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setSearchInput(q), [q]);

  const totals = useMemo(
    () =>
      orders.reduce(
        (acc, o) => {
          if (o.status === 'cancelled') return acc;
          const finance = o.finance;
          return {
            revenue: acc.revenue + (finance?.revenue ?? o.total),
            cost: acc.cost + (finance?.cost ?? 0),
            profit: acc.profit + (finance?.profit ?? 0),
            count: acc.count + 1,
          };
        },
        { revenue: 0, cost: 0, profit: 0, count: 0 },
      ),
    [orders],
  );

  function replaceOrder(updated: Order) {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    setDetail((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  async function changeStatus(order: Order, next: OrderStatus) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await adminApi.updateOrderStatus(order.id, next);
      replaceOrder(updated);
      toast.success(`Заказ ${updated.number}: ${updated.statusTitle}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  }

  const detailFinance = detail?.finance;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Заказы</h1>
          <p>
            {pagination ? `${pagination.total} заказов в базе` : 'Все заказы магазина'} · смена
            статусов и финансовый результат
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      <div className="admin-toolbar">
        <form
          className="admin-toolbar__search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: searchInput.trim() || null, page: null });
          }}
        >
          <input
            className="input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Номер, имя, телефон, город"
            aria-label="Поиск заказов"
          />
        </form>

        <div className="row">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${status === s || (s === 'all' && !status) ? 'active' : ''}`}
              onClick={() => update({ status: s === 'all' ? null : s, page: null })}
            >
              {s === 'all' ? 'Все' : STATUS_META[s].title}
            </button>
          ))}
        </div>

        <span className="admin-toolbar__spacer" />

        {(q || status) && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat">
          <span className="stat__label">Выручка на странице</span>
          <span className="stat__value">{formatPrice(totals.revenue)}</span>
          <span className="stat__note">активных заказов: {totals.count}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Себестоимость</span>
          <span className="stat__value">{formatPrice(totals.cost)}</span>
        </div>
        <div className="stat stat--accent">
          <span className="stat__label">Прибыль</span>
          <span className="stat__value">{formatPrice(totals.profit)}</span>
          <span className="stat__note">
            маржа{' '}
            {totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : '0.0'} %
          </span>
        </div>
      </div>

      {loading ? (
        <Loader label="Загружаем заказы…" />
      ) : (
        <>
          <div className="admin-section admin-section--flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Номер</th>
                    <th>Дата</th>
                    <th>Покупатель</th>
                    <th>Доставка</th>
                    <th className="num">Позиций</th>
                    <th className="num">Сумма</th>
                    <th className="num">Прибыль</th>
                    <th>Статус</th>
                    <th className="actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted">
                        Заказы не найдены.
                      </td>
                    </tr>
                  )}
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.number}</strong>
                        {order.promocode && (
                          <div className="muted small">промокод {order.promocode}</div>
                        )}
                      </td>
                      <td className="muted small">{formatDateTime(order.createdAt)}</td>
                      <td>
                        {order.customerName}
                        <div className="muted small">
                          {order.user?.email ?? order.phone} · {order.city}
                        </div>
                      </td>
                      <td className="small">{order.deliveryTitle}</td>
                      <td className="num">{order.itemsCount}</td>
                      <td className="num">
                        <strong>{formatPrice(order.total)}</strong>
                      </td>
                      <td
                        className={`num ${
                          order.status === 'cancelled'
                            ? ''
                            : (order.finance?.profit ?? 0) >= 0
                              ? 'num--accent'
                              : 'num--danger'
                        }`}
                      >
                        {order.status === 'cancelled' ? '—' : formatPrice(order.finance?.profit ?? 0)}
                      </td>
                      <td>
                        <StatusBadge status={order.status} title={order.statusTitle} />
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setDetail(order)}
                          >
                            Открыть
                          </button>
                          {NEXT_STATUSES[order.status].slice(0, 1).map((next) => (
                            <button
                              key={next}
                              type="button"
                              className="btn btn--sm"
                              onClick={() => changeStatus(order, next)}
                              disabled={busy}
                            >
                              {STATUS_META[next].title}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pagination && <PaginationNav pagination={pagination} onChange={(p) => update({ page: String(p) })} />}
        </>
      )}

      {/* ------------------------------ Детали заказа ------------------------- */}
      <Modal
        open={Boolean(detail)}
        wide
        title={detail ? `Заказ ${detail.number}` : ''}
        onClose={() => setDetail(null)}
        footer={
          detail && (
            <>
              <span style={{ marginRight: 'auto' }}>
                <StatusBadge status={detail.status} title={detail.statusTitle} />
              </span>
              {NEXT_STATUSES[detail.status].map((next) => (
                <button
                  key={next}
                  type="button"
                  className={`btn btn--sm ${next === 'cancelled' ? 'btn--ghost' : 'btn--accent'}`}
                  onClick={() => changeStatus(detail, next)}
                  disabled={busy}
                >
                  {next === 'cancelled' ? 'Отменить заказ' : `→ ${STATUS_META[next].title}`}
                </button>
              ))}
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDetail(null)}>
                Закрыть
              </button>
            </>
          )
        }
      >
        {detail && (
          <div className="col" style={{ gap: 18 }}>
            <div className="admin-grid-2">
              <div className="form-note">
                <strong>Покупатель</strong>
                {detail.customerName}
                <br />
                {detail.user?.email ?? '—'}
                <br />
                {detail.phone}
              </div>
              <div className="form-note">
                <strong>Доставка</strong>
                {detail.deliveryTitle} · {detail.city}
                <br />
                {detail.deliveryMethod === 'pickup' ? detail.pickupPoint : detail.address}
                {detail.comment && (
                  <>
                    <br />
                    <em>Комментарий: {detail.comment}</em>
                  </>
                )}
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Вариант</th>
                    <th className="num">Цена</th>
                    <th className="num">Себест.</th>
                    <th className="num">Кол-во</th>
                    <th className="num">Выручка</th>
                    <th className="num">Прибыль</th>
                  </tr>
                </thead>
                <tbody>
                  {asAdminItems(detail).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-product">
                          {item.image ? (
                            <img src={item.image} alt={item.name} />
                          ) : (
                            <span className="cell-thumb" aria-hidden />
                          )}
                          <div>
                            <Link to={`/product/${item.slug ?? item.productId}`} target="_blank">
                              {item.name}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="muted small">
                        {item.color} · {item.size}
                        <span className="mono"> {item.sku}</span>
                      </td>
                      <td className="num">{formatPrice(item.unitPrice)}</td>
                      <td className="num">{formatPrice(item.unitCost)}</td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{formatPrice(item.lineTotal)}</td>
                      <td className="num num--accent">{formatPrice(item.lineProfit)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Доставка</td>
                    <td className="num">
                      {detail.deliveryCost === 0 ? 'Бесплатно' : formatPrice(detail.deliveryCost)}
                    </td>
                    <td className="num">{detailFinance ? formatPrice(detailFinance.deliveryIncome) : '—'}</td>
                  </tr>
                  {detail.discount > 0 && (
                    <tr>
                      <td colSpan={5}>Скидка {detail.promocode ? `(${detail.promocode})` : ''}</td>
                      <td className="num num--danger">−{formatPrice(detail.discount)}</td>
                      <td className="num">—</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {detailFinance && (
              <div className="finance-total">
                <div>
                  <span className="muted">Выручка (товары − скидка)</span>
                  <strong>{formatPrice(detailFinance.revenue)}</strong>
                </div>
                <div>
                  <span className="muted">Себестоимость проданных позиций</span>
                  <strong>{formatPrice(detailFinance.cost)}</strong>
                </div>
                <div>
                  <span className="muted">Доход за доставку</span>
                  <strong>{formatPrice(detailFinance.deliveryIncome)}</strong>
                </div>
                <div>
                  <span className="muted">Прибыль с заказа</span>
                  <strong className={detailFinance.profit >= 0 ? 'num--accent' : 'num--danger'}>
                    {formatPrice(detailFinance.profit)}
                  </strong>
                </div>
                <div>
                  <span className="muted">Маржинальность</span>
                  <strong>{detailFinance.margin.toFixed(1)} %</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
