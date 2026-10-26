import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { AdminProduct, Category, Pagination } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { PaginationNav } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import { ProductForm } from './ProductForm';
import { CategoriesModal } from './CategoriesModal';
import './Admin.css';

type Sort = 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'name';

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'newest', label: 'Сначала новые' },
  { id: 'name', label: 'По названию' },
  { id: 'price_asc', label: 'Цена ↑' },
  { id: 'price_desc', label: 'Цена ↓' },
  { id: 'popular', label: 'По продажам' },
];

const PER_PAGE = 12;

function marginTone(margin: number) {
  if (margin >= 40) return 'margin-pill--good';
  if (margin >= 20) return 'margin-pill--mid';
  return 'margin-pill--bad';
}

/** Быстрое изменение остатков по вариациям товара. */
function StockModal({
  product,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  onClose: () => void;
  onSaved: (product: AdminProduct) => void;
}) {
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!product) return;
    setValues(Object.fromEntries(product.variants.map((v) => [v.id, String(v.stock)])));
  }, [product]);

  async function save() {
    if (!product || busy) return;
    setBusy(true);
    try {
      const items = product.variants
        .map((v) => ({ variantId: v.id, stock: Math.max(0, Number(values[v.id] ?? 0) || 0) }))
        .filter((item, index) => item.stock !== product.variants[index].stock);

      const updated =
        items.length > 0 ? await adminApi.updateStockBulk(product.id, items) : product;
      toast.success(
        items.length > 0
          ? `Остатки обновлены (${items.length} вариаций)`
          : 'Изменений нет',
      );
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить остатки');
    } finally {
      setBusy(false);
    }
  }

  if (!product) return null;

  const total = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <Modal
      open
      title={`Остатки: ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>
            Всего на складе: {total} шт.
          </span>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="btn btn--accent" onClick={save} disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить остатки'}
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Цвет</th>
              <th>Размер</th>
              <th className="num">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id}>
                <td className="mono">{variant.sku}</td>
                <td>{variant.color}</td>
                <td>{variant.size}</td>
                <td className="num">
                  <input
                    className="input"
                    style={{ width: 92 }}
                    type="number"
                    min={0}
                    value={values[variant.id] ?? ''}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [variant.id]: e.target.value }))
                    }
                    aria-label={`Остаток ${variant.sku}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

/** Товары: список с финансами, создание, редактирование, остатки, удаление. */
export default function AdminProducts() {
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const categoryId = params.get('category') ?? '';
  const sort = (params.get('sort') as Sort) ?? 'newest';
  const lowStock = params.get('lowStock') === 'true';
  const onlyActive = params.get('onlyActive') === 'true';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const editId = Number(params.get('edit') ?? 0) || null;

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string; country: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  const [searchInput, setSearchInput] = useState(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [stockFor, setStockFor] = useState<AdminProduct | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AdminProduct | null>(null);
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

  /* ------------------------------- Загрузка -------------------------------- */

  const loadCategories = useCallback(async () => {
    try {
      const { items } = await adminApi.categories();
      setCategories(items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить категории');
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    adminApi
      .suppliers()
      .then(({ items }) => setSuppliers(items))
      .catch(() => setSuppliers([]));
  }, [loadCategories]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await adminApi.products({
          q: q || undefined,
          category: categoryId ? Number(categoryId) : undefined,
          sort,
          page,
          limit: PER_PAGE,
          lowStock: lowStock ? 'true' : undefined,
          includeInactive: onlyActive ? 'false' : 'true',
        });
        if (!alive) return;
        setProducts(data.items);
        setPagination(data.pagination);
      } catch (err) {
        if (alive) toast.error(err instanceof Error ? err.message : 'Не удалось загрузить товары');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q, categoryId, sort, page, lowStock, onlyActive]);

  // Открытие карточки по ссылке ?edit=ID (из «остатков» на дашборде)
  useEffect(() => {
    if (!editId) return;
    adminApi
      .product(editId)
      .then((product) => {
        setEditing(product);
        setFormOpen(true);
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => update({ edit: null }));
  }, [editId, update]);

  useEffect(() => setSearchInput(q), [q]);

  /* -------------------------------- Действия ------------------------------- */

  const totals = useMemo(
    () =>
      products.reduce(
        (acc, p) => ({
          stock: acc.stock + p.totalStock,
          cost: acc.cost + p.finance.cost,
          price: acc.price + p.price,
          profit: acc.profit + p.finance.profit,
        }),
        { stock: 0, cost: 0, price: 0, profit: 0 },
      ),
    [products],
  );

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: AdminProduct) {
    setEditing(product);
    setFormOpen(true);
  }

  function replaceProduct(updated: AdminProduct) {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditing((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  async function toggleActive(product: AdminProduct) {
    setBusy(true);
    try {
      const updated = await adminApi.updateProduct(product.id, { isActive: !product.isActive });
      replaceProduct(updated);
      toast.success(updated.isActive ? `«${updated.name}» снова в продаже` : `«${updated.name}» снят с продажи`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить статус');
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removeTarget || busy) return;
    setBusy(true);
    try {
      const result = await adminApi.deleteProduct(removeTarget.id);
      toast.info(result.message);
      setProducts((prev) => prev.filter((p) => p.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить товар');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Товары</h1>
          <p>
            {pagination ? `${pagination.total} позиций в каталоге` : 'Каталог магазина'} · цены,
            себестоимость и остатки
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={() => setCategoriesOpen(true)}>
            Категории
          </button>
          <button type="button" className="btn btn--accent" onClick={openCreate}>
            + Новый товар
          </button>
        </div>
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
            placeholder="Поиск: название, бренд, SKU"
            aria-label="Поиск товаров"
          />
        </form>

        <select
          className="input"
          value={categoryId}
          onChange={(e) => update({ category: e.target.value || null, page: null })}
          aria-label="Категория"
        >
          <option value="">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.productsCount})
            </option>
          ))}
        </select>

        <select
          className="input"
          value={sort}
          onChange={(e) => update({ sort: e.target.value, page: null })}
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
          className={`chip ${lowStock ? 'active' : ''}`}
          onClick={() => update({ lowStock: lowStock ? null : 'true', page: null })}
        >
          Заканчиваются
        </button>
        <button
          type="button"
          className={`chip ${onlyActive ? 'active' : ''}`}
          onClick={() => update({ onlyActive: onlyActive ? null : 'true', page: null })}
        >
          Только в продаже
        </button>

        <span className="admin-toolbar__spacer" />

        {(q || categoryId || lowStock || onlyActive || sort !== 'newest') && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {loading ? (
        <Loader label="Загружаем товары…" />
      ) : (
        <>
          <div className="admin-section admin-section--flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Категория</th>
                    <th className="num">Закупка</th>
                    <th className="num">Себестоимость</th>
                    <th className="num">Продажа</th>
                    <th className="num">Прибыль</th>
                    <th className="num">Маржа</th>
                    <th className="num">Остаток</th>
                    <th className="num">Продано</th>
                    <th>Статус</th>
                    <th className="actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={11} className="muted">
                        Товары не найдены. Измените фильтры или создайте новый товар.
                      </td>
                    </tr>
                  )}
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="cell-product">
                          {product.images[0]?.url ? (
                            <img src={product.images[0].url} alt={product.name} loading="lazy" />
                          ) : (
                            <span className="cell-thumb" aria-hidden />
                          )}
                          <div>
                            <Link to={`/product/${product.slug}`} target="_blank">
                              {product.name}
                            </Link>
                            <small>
                              {product.brand ?? 'без бренда'} · {product.sizes.length} разм. ·{' '}
                              {product.colors.length} цв.
                            </small>
                          </div>
                        </div>
                      </td>
                      <td className="muted small">{product.category.name}</td>
                      <td className="num">{formatPrice(product.finance.purchasePrice)}</td>
                      <td className="num">{formatPrice(product.finance.cost)}</td>
                      <td className="num">
                        <strong>{formatPrice(product.finance.price)}</strong>
                      </td>
                      <td className={`num ${product.finance.profit >= 0 ? 'num--accent' : 'num--danger'}`}>
                        {formatPrice(product.finance.profit)}
                      </td>
                      <td className="num">
                        <span className={`margin-pill ${marginTone(product.finance.margin)}`}>
                          {product.finance.margin.toFixed(1)} %
                        </span>
                      </td>
                      <td className="num">
                        <span
                          className={`stock-pill ${
                            product.totalStock === 0
                              ? 'stock-pill--out'
                              : product.totalStock <= 5
                                ? 'stock-pill--low'
                                : ''
                          }`}
                        >
                          {product.totalStock}
                        </span>
                      </td>
                      <td className="num">{product.finance.soldUnits}</td>
                      <td>
                        {product.isActive ? (
                          <span className="badge badge--ok">в продаже</span>
                        ) : (
                          <span className="badge">скрыт</span>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => openEdit(product)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setStockFor(product)}
                          >
                            Остатки
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => toggleActive(product)}
                            disabled={busy}
                          >
                            {product.isActive ? 'Снять' : 'Вернуть'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setRemoveTarget(product)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {products.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={7}>Итого на странице</td>
                      <td className="num">{totals.stock}</td>
                      <td className="num">—</td>
                      <td colSpan={2} className="num num--accent">
                        {formatPrice(totals.profit)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {pagination && <PaginationNav pagination={pagination} onChange={(p) => update({ page: String(p) })} />}
        </>
      )}

      {/* ------------------------------- Модалки ------------------------------ */}
      <ProductForm
        open={formOpen}
        product={editing}
        categories={categories}
        suppliers={suppliers}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          setProducts((prev) =>
            prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev],
          );
          if (pagination) setPagination({ ...pagination, total: pagination.total + (editing ? 0 : 1) });
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <StockModal
        product={stockFor}
        onClose={() => setStockFor(null)}
        onSaved={(updated) => {
          replaceProduct(updated);
          setStockFor(null);
        }}
      />

      <CategoriesModal
        open={categoriesOpen}
        categories={categories}
        onClose={() => setCategoriesOpen(false)}
        onChanged={loadCategories}
      />

      <Modal
        open={Boolean(removeTarget)}
        title="Удаление товара"
        onClose={() => setRemoveTarget(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRemoveTarget(null)} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn btn--danger" onClick={confirmRemove} disabled={busy}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </button>
          </>
        }
      >
        {removeTarget && (
          <div className="col">
            <p>
              Товар <strong>«{removeTarget.name}»</strong> (
              {formatPrice(removeTarget.price)}) будет удалён.
            </p>
            <p className="alert alert--info">
              Если товар участвовал в заказах, система снимет его с продажи вместо удаления —
              история заказов и финансовая аналитика останутся целыми.
            </p>
            {removeTarget.finance.soldUnits > 0 && (
              <p className="muted small">
                Продано единиц: {removeTarget.finance.soldUnits} · прибыль{' '}
                {formatPrice(removeTarget.finance.totalProfit)}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
