import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { productApi, type ProductQuery } from '../services/endpoints';
import type { Facets, Product, ProductListResponse } from '../services/types';
import { ProductCard } from '../components/ProductCard';
import { EmptyState, ProductGridSkeleton } from '../components/Loader';
import { PaginationNav } from '../components/Pagination';
import { useQuickAdd } from '../lib/useQuickAdd';
import './CatalogPage.css';

const SORTS: Array<{ id: NonNullable<ProductQuery['sort']>; label: string }> = [
  { id: 'newest', label: 'Сначала новые' },
  { id: 'popular', label: 'Популярные' },
  { id: 'price_asc', label: 'Цена: по возрастанию' },
  { id: 'price_desc', label: 'Цена: по убыванию' },
  { id: 'rating', label: 'По рейтингу' },
  { id: 'name', label: 'По названию' },
];

function parseList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** Читает параметры фильтрации из URL — состояние каталога живёт в адресной строке. */
function readQuery(params: URLSearchParams): Required<Pick<ProductQuery, 'sort' | 'page'>> & ProductQuery {
  return {
    q: params.get('q') ?? undefined,
    category: parseList(params.get('category')).map(Number).filter((n) => Number.isFinite(n)),
    brand: parseList(params.get('brand')),
    size: parseList(params.get('size')),
    color: parseList(params.get('color')),
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    inStock: params.get('inStock') === 'true' ? true : undefined,
    sort: (params.get('sort') as ProductQuery['sort']) ?? 'newest',
    page: Number(params.get('page') ?? 1) || 1,
    limit: 12,
  };
}

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => readQuery(params), [params]);

  const [data, setData] = useState<ProductListResponse | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [priceDraft, setPriceDraft] = useState({ min: '', max: '' });
  const quickAdd = useQuickAdd();

  // Загрузка товаров по текущим фильтрам
  useEffect(() => {
    let alive = true;
    setLoading(true);
    productApi
      .list(query)
      .then((result) => {
        if (alive) setData(result);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  // Значения фильтров загружаем один раз
  useEffect(() => {
    productApi.facets().then(setFacets).catch(() => undefined);
  }, []);

  useEffect(() => {
    setPriceDraft({
      min: query.minPrice !== undefined ? String(query.minPrice) : '',
      max: query.maxPrice !== undefined ? String(query.maxPrice) : '',
    });
  }, [query.minPrice, query.maxPrice]);

  const update = useCallback(
    (patch: Record<string, string | number | undefined | null>, resetPage = true) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      if (resetPage) next.delete('page');
      setParams(next, { replace: false });
    },
    [params, setParams],
  );

  const toggleIn = useCallback(
    (key: 'category' | 'brand' | 'size' | 'color', value: string) => {
      const current = parseList(params.get(key));
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      update({ [key]: next.join(',') });
    },
    [params, update],
  );

  const resetAll = () => setParams(new URLSearchParams(), { replace: false });

  const activeCount =
    query.category!.length +
    query.brand!.length +
    query.size!.length +
    query.color!.length +
    (query.minPrice !== undefined ? 1 : 0) +
    (query.maxPrice !== undefined ? 1 : 0) +
    (query.inStock ? 1 : 0);

  const items: Product[] = data?.items ?? [];

  return (
    <div className="container catalog">
      <div className="breadcrumbs">
        <a href="/">Главная</a> <span aria-hidden>/</span> <span>Каталог</span>
      </div>

      <div className="page-head">
        <div>
          <h1>{query.q ? `Поиск: «${query.q}»` : 'Каталог'}</h1>
          <p className="page-subtitle">
            {loading && data === null
              ? 'Загружаем товары…'
              : `Найдено ${data?.pagination.total ?? 0} товар(ов)`}
          </p>
        </div>

        <div className="catalog__controls">
          <label className="catalog__sort">
            <span className="xs muted">Сортировка</span>
            <select
              className="select"
              value={query.sort}
              onChange={(e) => update({ sort: e.target.value })}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn--ghost catalog__filters-toggle"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Фильтры{activeCount > 0 ? ` · ${activeCount}` : ''}
          </button>
        </div>
      </div>

      <div className="catalog__layout">
        {/* ------------------------------- Фильтры ------------------------------ */}
        <aside className={`catalog__aside ${filtersOpen ? 'is-open' : ''}`}>
          <div className="catalog__aside-head">
            <strong>Фильтры</strong>
            <div className="row">
              {activeCount > 0 && (
                <button type="button" className="link-btn" onClick={resetAll}>
                  Сбросить
                </button>
              )}
              <button
                type="button"
                className="btn btn--ghost btn--sm catalog__close"
                onClick={() => setFiltersOpen(false)}
              >
                Закрыть
              </button>
            </div>
          </div>

          <section className="filter">
            <h4>Категория</h4>
            <div className="filter__list">
              {facets?.categories.map((c) => (
                <label key={c.id} className="checkbox">
                  <input
                    type="checkbox"
                    checked={query.category!.includes(c.id)}
                    onChange={() => toggleIn('category', String(c.id))}
                  />
                  <span>{c.name}</span>
                  <span className="filter__count">{c.count}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="filter">
            <h4>Цена, ₽</h4>
            <div className="filter__price">
              <input
                className="input"
                type="number"
                min={0}
                placeholder={facets ? String(Math.floor(facets.price.min)) : 'от'}
                value={priceDraft.min}
                onChange={(e) => setPriceDraft((d) => ({ ...d, min: e.target.value }))}
              />
              <span aria-hidden>—</span>
              <input
                className="input"
                type="number"
                min={0}
                placeholder={facets ? String(Math.ceil(facets.price.max)) : 'до'}
                value={priceDraft.max}
                onChange={(e) => setPriceDraft((d) => ({ ...d, max: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm btn--block"
              onClick={() => update({ minPrice: priceDraft.min || undefined, maxPrice: priceDraft.max || undefined })}
            >
              Применить цену
            </button>
          </section>

          <section className="filter">
            <h4>Размер</h4>
            <div className="filter__chips">
              {facets?.sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip"
                  aria-pressed={query.size!.includes(s)}
                  onClick={() => toggleIn('size', s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section className="filter">
            <h4>Цвет</h4>
            <div className="filter__chips">
              {facets?.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={query.color!.includes(c)}
                  onClick={() => toggleIn('color', c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

          <section className="filter">
            <h4>Бренд</h4>
            <div className="filter__list filter__list--scroll">
              {facets?.brands.map((b) => (
                <label key={b} className="checkbox">
                  <input
                    type="checkbox"
                    checked={query.brand!.includes(b)}
                    onChange={() => toggleIn('brand', b)}
                  />
                  <span>{b}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="filter">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(query.inStock)}
                onChange={(e) => update({ inStock: e.target.checked ? 'true' : undefined })}
              />
              <span>Только в наличии</span>
            </label>
          </section>
        </aside>

        {/* -------------------------------- Товары ------------------------------ */}
        <div className="catalog__content">
          {activeCount > 0 && (
            <div className="catalog__active row row--wrap">
              {query.category!.map((id) => {
                const c = facets?.categories.find((x) => x.id === id);
                return (
                  <button key={id} type="button" className="chip active" onClick={() => toggleIn('category', String(id))}>
                    {c?.name ?? id} ✕
                  </button>
                );
              })}
              {query.size!.map((s) => (
                <button key={s} type="button" className="chip active" onClick={() => toggleIn('size', s)}>
                  {s} ✕
                </button>
              ))}
              {query.color!.map((c) => (
                <button key={c} type="button" className="chip active" onClick={() => toggleIn('color', c)}>
                  {c} ✕
                </button>
              ))}
              {query.brand!.map((b) => (
                <button key={b} type="button" className="chip active" onClick={() => toggleIn('brand', b)}>
                  {b} ✕
                </button>
              ))}
              {(query.minPrice !== undefined || query.maxPrice !== undefined) && (
                <button
                  type="button"
                  className="chip active"
                  onClick={() => update({ minPrice: undefined, maxPrice: undefined })}
                >
                  {query.minPrice ?? 0}–{query.maxPrice ?? '∞'} ₽ ✕
                </button>
              )}
              {query.inStock && (
                <button type="button" className="chip active" onClick={() => update({ inStock: undefined })}>
                  В наличии ✕
                </button>
              )}
            </div>
          )}

          {loading ? (
            <ProductGridSkeleton count={9} />
          ) : items.length === 0 ? (
            <EmptyState
              title="Ничего не нашлось"
              description="Попробуйте изменить фильтры или поисковый запрос."
              action={
                <button type="button" className="btn" onClick={resetAll}>
                  Сбросить фильтры
                </button>
              }
            />
          ) : (
            <>
              <div className="grid-products">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} onQuickAdd={quickAdd} />
                ))}
              </div>

              <PaginationNav
                pagination={data!.pagination}
                onChange={(page) => {
                  update({ page }, false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
