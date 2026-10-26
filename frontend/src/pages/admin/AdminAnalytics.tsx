import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { ProfitReport, ProfitRow, Statistics } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { ShareBars } from '../../components/BarChart';
import './Admin.css';

type SortKey = 'profit' | 'margin' | 'unitsSold' | 'name' | 'stock';

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'profit', label: 'По прибыли' },
  { id: 'margin', label: 'По маржинальности' },
  { id: 'unitsSold', label: 'По продажам' },
  { id: 'stock', label: 'По остаткам' },
  { id: 'name', label: 'По названию' },
];

function marginTone(margin: number) {
  if (margin >= 40) return 'margin-pill--good';
  if (margin >= 20) return 'margin-pill--mid';
  return 'margin-pill--bad';
}

/** Аналитика: отчёт о прибыли по каждому товару и остатки на складе. */
export default function AdminAnalytics() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').toLowerCase();
  const sort = (params.get('sort') as SortKey) ?? 'profit';
  const onlyProblem = params.get('problem') === 'true';

  const [report, setReport] = useState<ProfitReport | null>(null);
  const [stock, setStock] = useState<Statistics['lowStock'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(params.get('q') ?? '');
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profit, stats] = await Promise.all([adminApi.profit(), adminApi.statistics()]);
      setReport(profit);
      setStock(stats.lowStock);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setSearchInput(params.get('q') ?? ''), [params]);

  const rows = useMemo(() => {
    if (!report) return [] as ProfitRow[];
    let items = [...report.items];

    if (q) {
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.supplier ?? '').toLowerCase().includes(q),
      );
    }
    if (onlyProblem) {
      items = items.filter((r) => r.margin < 25 || r.unitsSold === 0 || r.stock <= 5);
    }

    items.sort((a, b) => {
      switch (sort) {
        case 'margin':
          return b.margin - a.margin;
        case 'unitsSold':
          return b.unitsSold - a.unitsSold;
        case 'stock':
          return a.stock - b.stock;
        case 'name':
          return a.name.localeCompare(b.name, 'ru');
        default:
          return b.totalProfit - a.totalProfit;
      }
    });

    return items;
  }, [report, q, sort, onlyProblem]);

  const sums = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          cost: acc.cost + r.cost,
          price: acc.price + r.price,
          profit: acc.profit + r.profit,
          totalProfit: acc.totalProfit + r.totalProfit,
          unitsSold: acc.unitsSold + r.unitsSold,
          stock: acc.stock + r.stock,
        }),
        { cost: 0, price: 0, profit: 0, totalProfit: 0, unitsSold: 0, stock: 0 },
      ),
    [rows],
  );

  const costStructure = useMemo(() => {
    if (rows.length === 0) return [];
    const sum = (pick: (r: ProfitRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return [
      { label: 'Закупка у поставщика', value: sum((r) => r.purchasePrice), tone: 'accent' },
      { label: 'Доставка из Китая', value: sum((r) => r.deliveryCost), tone: 'warn' },
      { label: 'Комиссия посредника', value: sum((r) => r.commission), tone: 'warn' },
      { label: 'Таможня', value: sum((r) => r.customs), tone: 'warn' },
      { label: 'Упаковка', value: sum((r) => r.packaging) },
      { label: 'Эквайринг', value: sum((r) => r.paymentFee) },
      { label: 'Реклама', value: sum((r) => r.advertising) },
    ].filter((r) => r.value > 0);
  }, [rows]);

  const avgMargin = sums.price > 0 ? ((sums.price - sums.cost) / sums.price) * 100 : 0;

  if (loading && !report) return <Loader label="Считаем прибыль…" />;
  if (!report) return <p className="alert alert--error">Отчёт недоступен.</p>;

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Аналитика и прибыль</h1>
          <p>
            Отчёт доступен только администратору: закупочные цены и себестоимость не передаются в
            клиентскую часть магазина
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      {/* ------------------------------ Формулы ------------------------------ */}
      <div className="admin-section">
        <h2 className="card-title">Финансовая модель магазина</h2>
        <div className="admin-grid-3">
          <div className="form-note">
            <strong>Себестоимость</strong>
            закупочная цена + доставка из Китая + комиссия посредника + таможня + упаковка +
            эквайринг + реклама
          </div>
          <div className="form-note">
            <strong>Прибыль с единицы</strong>
            цена продажи − себестоимость − дополнительные расходы (уже входят в себестоимость)
          </div>
          <div className="form-note">
            <strong>Маржинальность</strong>
            прибыль / цена продажи × 100 %
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat stat--dark">
          <span className="stat__label">Прибыль всего</span>
          <span className="stat__value">{formatPrice(report.totals.totalProfit)}</span>
          <span className="stat__note">по {report.items.length} товарам каталога</span>
        </div>
        <div className="stat">
          <span className="stat__label">Продано единиц</span>
          <span className="stat__value">{report.totals.unitsSold}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Средняя себестоимость</span>
          <span className="stat__value">
            {formatPrice(report.items.length ? report.totals.cost / report.items.length : 0)}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Средняя цена продажи</span>
          <span className="stat__value">
            {formatPrice(report.items.length ? report.totals.price / report.items.length : 0)}
          </span>
        </div>
        <div className="stat stat--accent">
          <span className="stat__label">Средняя маржинальность</span>
          <span className="stat__value">
            {report.totals.price > 0
              ? (((report.totals.price - report.totals.cost) / report.totals.price) * 100).toFixed(1)
              : '0.0'}{' '}
            %
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Остаток на складе</span>
          <span className="stat__value">{report.totals.stock}</span>
          <span className="stat__note">единиц товаров</span>
        </div>
      </div>

      {/* ------------------------------ Фильтры ------------------------------ */}
      <div className="admin-toolbar">
        <form
          className="admin-toolbar__search"
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams(params);
            const value = searchInput.trim();
            if (value) next.set('q', value);
            else next.delete('q');
            setParams(next, { replace: true });
          }}
        >
          <input
            className="input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Товар, категория или поставщик"
            aria-label="Поиск по отчёту"
          />
        </form>

        <select
          className="input"
          value={sort}
          onChange={(e) => {
            const next = new URLSearchParams(params);
            next.set('sort', e.target.value);
            setParams(next, { replace: true });
          }}
          aria-label="Сортировка"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={`chip ${onlyProblem ? 'active' : ''}`}
          onClick={() => {
            const next = new URLSearchParams(params);
            if (onlyProblem) next.delete('problem');
            else next.set('problem', 'true');
            setParams(next, { replace: true });
          }}
        >
          Требуют внимания
        </button>

        <span className="admin-toolbar__spacer" />

        <span className="muted small">Показано: {rows.length}</span>
      </div>

      <div className="admin-grid-2">
        <div className="admin-section">
          <h2 className="card-title">Структура себестоимости (сумма по товарам)</h2>
          <ShareBars items={costStructure} format={formatPrice} />
          <p className="muted small" style={{ marginTop: 12 }}>
            Средняя маржа по отфильтрованным товарам: <strong>{avgMargin.toFixed(1)} %</strong>
          </p>
        </div>

        <div className="admin-section">
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <h2 className="card-title" style={{ margin: 0 }}>
              Остатки ниже порога
            </h2>
            <Link to="/admin/products?lowStock=true" className="btn btn--ghost btn--sm">
              Пополнить
            </Link>
          </div>
          {stock && stock.variants.length > 0 ? (
            <ShareBars
              items={stock.variants.slice(0, 8).map((v) => ({
                label: `${v.product.name} · ${v.color}/${v.size}`,
                value: v.stock,
                tone: v.stock === 0 ? 'danger' : 'warn',
              }))}
              format={(v) => `${v} шт.`}
            />
          ) : (
            <p className="muted small">Все вариации выше порога {stock?.threshold ?? 5} шт.</p>
          )}
          {stock && stock.outOfStockProducts.length > 0 && (
            <p className="alert alert--error" style={{ marginTop: 12 }}>
              Полностью закончились: {stock.outOfStockProducts.map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
      </div>

      {/* ------------------------------- Отчёт ------------------------------- */}
      <div className="admin-section admin-section--flush">
        <div className="admin-section__head">
          <div>
            <h2>Прибыль по товарам</h2>
            <p>Нажмите на строку, чтобы увидеть полный расчёт себестоимости</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Категория</th>
                <th>Поставщик</th>
                <th className="num">Себестоимость</th>
                <th className="num">Продажа</th>
                <th className="num">Прибыль/ед.</th>
                <th className="num">Маржа</th>
                <th className="num">Продано</th>
                <th className="num">Прибыль всего</th>
                <th className="num">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">
                    Ничего не найдено.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <Fragment key={row.productId}>
                  <tr
                    onClick={() => setExpanded(expanded === row.productId ? null : row.productId)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong>{row.name}</strong>
                      {!row.isActive && <span className="badge" style={{ marginLeft: 6 }}>скрыт</span>}
                    </td>
                    <td className="muted small">{row.category}</td>
                    <td className="muted small">{row.supplier ?? '—'}</td>
                    <td className="num">{formatPrice(row.cost)}</td>
                    <td className="num">
                      <strong>{formatPrice(row.price)}</strong>
                    </td>
                    <td className={`num ${row.profit >= 0 ? 'num--accent' : 'num--danger'}`}>
                      {formatPrice(row.profit)}
                    </td>
                    <td className="num">
                      <span className={`margin-pill ${marginTone(row.margin)}`}>
                        {row.margin.toFixed(1)} %
                      </span>
                    </td>
                    <td className="num">{row.unitsSold}</td>
                    <td className="num">
                      <strong>{formatPrice(row.totalProfit)}</strong>
                    </td>
                    <td className="num">
                      <span
                        className={`stock-pill ${
                          row.stock === 0 ? 'stock-pill--out' : row.stock <= 5 ? 'stock-pill--low' : ''
                        }`}
                      >
                        {row.stock}
                      </span>
                    </td>
                  </tr>
                  {expanded === row.productId && (
                    <tr className="row-details">
                      <td colSpan={10}>
                        <div className="finance-total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                          <div>
                            <span className="muted">Закупочная цена</span>
                            <strong>{formatPrice(row.purchasePrice)}</strong>
                          </div>
                          <div>
                            <span className="muted">Доставка из Китая</span>
                            <strong>{formatPrice(row.deliveryCost)}</strong>
                          </div>
                          <div>
                            <span className="muted">Комиссия посредника</span>
                            <strong>{formatPrice(row.commission)}</strong>
                          </div>
                          <div>
                            <span className="muted">Таможенные платежи</span>
                            <strong>{formatPrice(row.customs)}</strong>
                          </div>
                          <div>
                            <span className="muted">Упаковка</span>
                            <strong>{formatPrice(row.packaging)}</strong>
                          </div>
                          <div>
                            <span className="muted">Комиссия платёжной системы</span>
                            <strong>{formatPrice(row.paymentFee)}</strong>
                          </div>
                          <div>
                            <span className="muted">Реклама</span>
                            <strong>{formatPrice(row.advertising)}</strong>
                          </div>
                          <div>
                            <span className="muted">
                              = Себестоимость (сумма всех статей)
                            </span>
                            <strong>{formatPrice(row.cost)}</strong>
                          </div>
                          <div>
                            <span className="muted">Цена продажи − себестоимость = прибыль</span>
                            <strong className={row.profit >= 0 ? 'num--accent' : 'num--danger'}>
                              {formatPrice(row.price)} − {formatPrice(row.cost)} ={' '}
                              {formatPrice(row.profit)}
                            </strong>
                          </div>
                          <div>
                            <span className="muted">Маржинальность = прибыль / цена × 100</span>
                            <strong>{row.margin.toFixed(1)} %</strong>
                          </div>
                          <div>
                            <span className="muted">Прибыль всего = прибыль × продано единиц</span>
                            <strong>
                              {formatPrice(row.profit)} × {row.unitsSold} ={' '}
                              {formatPrice(row.totalProfit)}
                            </strong>
                          </div>
                        </div>
                        <div className="row" style={{ marginTop: 12 }}>
                          <Link
                            to={`/admin/products?edit=${row.productId}`}
                            className="btn btn--ghost btn--sm"
                          >
                            Изменить товар и финансы
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Итого ({rows.length})</td>
                <td className="num">{formatPrice(sums.cost)}</td>
                <td className="num">{formatPrice(sums.price)}</td>
                <td className="num">{formatPrice(sums.profit)}</td>
                <td className="num">{avgMargin.toFixed(1)} %</td>
                <td className="num">{sums.unitsSold}</td>
                <td className="num num--accent">{formatPrice(sums.totalProfit)}</td>
                <td className="num">{sums.stock}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}
