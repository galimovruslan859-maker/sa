import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { OrderStatus, Statistics } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { StatusBadge, STATUS_META } from '../../components/StatusBadge';
import { BarChart, ShareBars } from '../../components/BarChart';
import './Admin.css';

const PERIODS = [
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 365, label: 'Год' },
  { days: 0, label: 'Всё время' },
];

const EXPENSE_TITLES: Record<string, string> = {
  advertising: 'Реклама',
  logistics: 'Логистика',
  packaging: 'Упаковка',
  payment_fee: 'Эквайринг',
  rent: 'Аренда',
  salary: 'Зарплата',
  other: 'Прочее',
};

/** Обзор: ключевые показатели магазина, динамика, лидеры продаж, остатки. */
export default function AdminDashboard() {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.statistics(days > 0 ? days : undefined));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <Loader label="Считаем показатели…" />;
  if (!data) return <p className="alert alert--error">Данные недоступны.</p>;

  const { orders, finance, catalog, allTime, daily, bestSellers, lowSales, lowStock } = data;

  const dailyPoints = daily.map((d) => ({
    label: new Date(d.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    value: d.revenue,
    secondary: d.profit,
    hint: `Заказов: ${d.orders}`,
  }));

  const statusShares = orders.byStatus.map((row) => ({
    label: STATUS_META[row.status as OrderStatus]?.title ?? row.status,
    value: row.count,
    tone:
      row.status === 'delivered'
        ? 'ok'
        : row.status === 'cancelled'
          ? 'danger'
          : row.status === 'pending'
            ? 'warn'
            : 'accent',
  }));

  const expenseShares = finance.expensesByCategory.map((row) => ({
    label: EXPENSE_TITLES[row.category] ?? row.category,
    value: row.amount,
    tone: 'warn',
  }));

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Обзор магазина</h1>
          <p>
            Период: {data.range.from ? `${formatDate(data.range.from)} — ${formatDate(data.range.to)}` : 'всё время'} ·
            обновлено {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="row">
          <div className="segmented">
            {PERIODS.map((period) => (
              <button
                key={period.days}
                type="button"
                className={days === period.days ? 'is-active' : ''}
                onClick={() => setDays(period.days)}
              >
                {period.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
      </div>

      {/* ------------------------- Ключевые показатели ------------------------ */}
      <div className="stat-grid">
        <div className="stat stat--dark">
          <span className="stat__label">Выручка</span>
          <span className="stat__value">{formatPrice(finance.revenue)}</span>
          <span className="stat__note">
            без учёта доставки {formatPrice(finance.deliveryIncome)}
          </span>
        </div>
        <div className="stat stat--accent">
          <span className="stat__label">Прибыль</span>
          <span className="stat__value">{formatPrice(finance.profit)}</span>
          <span className="stat__note">маржинальность {finance.margin.toFixed(1)} %</span>
        </div>
        <div className="stat">
          <span className="stat__label">Заказов</span>
          <span className="stat__value">{orders.total}</span>
          <span className="stat__note">
            оплачено {orders.paid} · отменено {orders.cancelled}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Средний чек</span>
          <span className="stat__value">{formatPrice(orders.averageCheck)}</span>
          <span className="stat__note">продано единиц: {orders.unitsSold}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Себестоимость</span>
          <span className="stat__value">{formatPrice(finance.cost)}</span>
          <span className="stat__note">закупка + доставка + комиссии</span>
        </div>
        <div className="stat">
          <span className="stat__label">Расходы</span>
          <span className="stat__value">{formatPrice(finance.expenses)}</span>
          <span className="stat__note">реклама, упаковка, аренда</span>
        </div>
        <div className="stat">
          <span className="stat__label">Активных товаров</span>
          <span className="stat__value">{catalog.activeProducts}</span>
          <span className="stat__note">вариаций: {catalog.variantCount}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Остаток на складе</span>
          <span className="stat__value">{catalog.totalStockUnits}</span>
          <span className="stat__note">покупателей: {catalog.customers}</span>
        </div>
      </div>

      {/* -------------------------------- Динамика ---------------------------- */}
      <div className="admin-section">
        <div className="row--between row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Динамика выручки и прибыли</h2>
          <Link to="/admin/analytics" className="btn btn--ghost btn--sm">
            Полная аналитика →
          </Link>
        </div>
        <BarChart data={dailyPoints} primaryLabel="Выручка" secondaryLabel="Прибыль" height={200} />
      </div>

      <div className="admin-grid-2">
        <div className="admin-section">
          <h2 className="card-title">Заказы по статусам</h2>
          <ShareBars items={statusShares} format={(v) => `${v} шт.`} />
          <div className="row" style={{ marginTop: 14 }}>
            <StatusBadge status="delivered" />
            <span className="muted small">
              в статистику выручки попадают заказы paid, processing, shipped, delivered
            </span>
          </div>
        </div>

        <div className="admin-section">
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Расходы по категориям
            </h2>
            <Link to="/admin/expenses" className="btn btn--ghost btn--sm">
              Управлять
            </Link>
          </div>
          <ShareBars items={expenseShares} format={formatPrice} />
        </div>
      </div>

      {/* ------------------------------ Лидеры продаж ------------------------- */}
      <div className="admin-section admin-section--flush">
        <div className="admin-section__head">
          <div>
            <h2>Самые продаваемые товары</h2>
            <p>Топ-8 по количеству проданных единиц за период</p>
          </div>
          <Link to="/admin/analytics" className="btn btn--ghost btn--sm">
            Отчёт по прибыли
          </Link>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th className="num">Продано</th>
                <th className="num">Выручка</th>
                <th className="num">Прибыль</th>
                <th className="num">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {bestSellers.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    За выбранный период продаж не было.
                  </td>
                </tr>
              )}
              {bestSellers.slice(0, 8).map((row) => (
                <tr key={row.productId}>
                  <td>
                    <div className="cell-product">
                      {row.image ? (
                        <img src={row.image} alt={row.name} loading="lazy" />
                      ) : (
                        <span className="cell-thumb" aria-hidden />
                      )}
                      <div>
                        <Link to={`/product/${row.slug ?? row.productId}`}>{row.name}</Link>
                      </div>
                    </div>
                  </td>
                  <td className="muted small">{row.category ?? '—'}</td>
                  <td className="num">{row.unitsSold}</td>
                  <td className="num">{formatPrice(row.revenue)}</td>
                  <td className="num num--accent">{formatPrice(row.profit)}</td>
                  <td className="num">
                    <span
                      className={`stock-pill ${row.stock === 0 ? 'stock-pill--out' : row.stock <= 5 ? 'stock-pill--low' : ''}`}
                    >
                      {row.stock}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-grid-2">
        {/* ------------------------- Товары с низкими продажами ---------------- */}
        <div className="admin-section admin-section--flush">
          <div className="admin-section__head">
            <div>
              <h2>Низкие продажи</h2>
              <p>Товары, которые почти не покупают</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="num">Продано</th>
                  <th className="num">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {lowSales.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      Все товары продаются стабильно.
                    </td>
                  </tr>
                )}
                {lowSales.slice(0, 8).map((row) => (
                  <tr key={row.productId}>
                    <td>
                      <div className="cell-product">
                        {row.image ? (
                          <img src={row.image} alt={row.name} loading="lazy" />
                        ) : (
                          <span className="cell-thumb" aria-hidden />
                        )}
                        <div>
                          <Link to={`/product/${row.slug ?? row.productId}`}>{row.name}</Link>
                          <small>{formatPrice(row.price)}</small>
                        </div>
                      </div>
                    </td>
                    <td className="num">{row.unitsSold}</td>
                    <td className="num">{row.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* -------------------------------- Остатки --------------------------- */}
        <div className="admin-section admin-section--flush">
          <div className="admin-section__head">
            <div>
              <h2>Заканчиваются на складе</h2>
              <p>Порог: {lowStock.threshold} шт. на вариацию</p>
            </div>
            <Link to="/admin/products?lowStock=true" className="btn btn--ghost btn--sm">
              Пополнить
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Вариация</th>
                  <th>SKU</th>
                  <th className="num">Остаток</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.variants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      Все вариации в достатке.
                    </td>
                  </tr>
                )}
                {lowStock.variants.slice(0, 8).map((row) => (
                  <tr key={row.variantId}>
                    <td>
                      <Link to={`/admin/products?edit=${row.product.id}`}>{row.product.name}</Link>
                      <div className="muted small">
                        {row.color} · {row.size}
                      </div>
                    </td>
                    <td className="mono">{row.sku}</td>
                    <td className="num">
                      <span
                        className={`stock-pill ${row.stock === 0 ? 'stock-pill--out' : 'stock-pill--low'}`}
                      >
                        {row.stock}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ------------------------------ За всё время ------------------------- */}
      <div className="admin-section">
        <h2 className="card-title">Итоги за всё время</h2>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat__label">Выручка</span>
            <span className="stat__value">{formatPrice(allTime.revenue)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Себестоимость</span>
            <span className="stat__value">{formatPrice(allTime.cost)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Прибыль</span>
            <span className="stat__value">{formatPrice(allTime.profit)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Маржинальность</span>
            <span className="stat__value">
              {allTime.revenue > 0 ? ((allTime.profit / allTime.revenue) * 100).toFixed(1) : '0.0'} %
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
