import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { ProductPayload } from '../../services/endpoints';
import type { AdminProduct, Category, ProductColor } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Modal } from '../../components/Modal';

interface FinanceDraft {
  purchasePrice: number;
  deliveryCost: number;
  commission: number;
  customs: number;
  packaging: number;
  paymentFee: number;
  advertising: number;
}

export interface ProductDraft {
  name: string;
  slug: string;
  brand: string;
  categoryId: number | '';
  supplierId: number | '';
  description: string;
  composition: string;
  price: string;
  finance: Record<keyof FinanceDraft, string>;
  sizes: string[];
  colors: ProductColor[];
  images: Array<{ url: string; alt: string }>;
  stock: Record<string, string>;
  isActive: boolean;
}

const FINANCE_FIELDS: Array<{ key: keyof FinanceDraft; label: string; hint: string }> = [
  { key: 'purchasePrice', label: 'Закупочная цена', hint: 'Цена у поставщика в Китае' },
  { key: 'deliveryCost', label: 'Доставка из Китая', hint: 'Логистика до склада в РФ' },
  { key: 'commission', label: 'Комиссия посредника', hint: 'Байер / карго-компания' },
  { key: 'customs', label: 'Таможенные платежи', hint: 'Пошлина и НДС' },
  { key: 'packaging', label: 'Упаковка', hint: 'Пакет, бирка, коробка' },
  { key: 'paymentFee', label: 'Комиссия платёжной системы', hint: 'Эквайринг, % от продажи' },
  { key: 'advertising', label: 'Реклама', hint: 'Продвижение единицы товара' },
];

const EMPTY_FINANCE: Record<keyof FinanceDraft, string> = {
  purchasePrice: '',
  deliveryCost: '',
  commission: '',
  customs: '',
  packaging: '',
  paymentFee: '',
  advertising: '',
};

const key = (size: string, color: string) => `${size}|${color}`;

function toNumber(value: string): number {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function emptyDraft(categoryId: number | '' = ''): ProductDraft {
  return {
    name: '',
    slug: '',
    brand: '',
    categoryId,
    supplierId: '',
    description: '',
    composition: '',
    price: '',
    finance: { ...EMPTY_FINANCE },
    sizes: ['S', 'M', 'L'],
    colors: [{ name: 'Чёрный', hex: '#111111' }],
    images: [],
    stock: {},
    isActive: true,
  };
}

export function draftFromProduct(product: AdminProduct): ProductDraft {
  const stock: Record<string, string> = {};
  for (const v of product.variants) stock[key(v.size, v.color)] = String(v.stock);

  return {
    name: product.name,
    slug: product.slug,
    brand: product.brand ?? '',
    categoryId: product.category.id,
    supplierId: product.supplier?.id ?? '',
    description: product.description ?? '',
    composition: product.composition ?? '',
    price: String(product.price),
    finance: {
      purchasePrice: String(product.finance.purchasePrice),
      deliveryCost: String(product.finance.deliveryCost),
      commission: String(product.finance.commission),
      customs: String(product.finance.customs),
      packaging: String(product.finance.packaging),
      paymentFee: String(product.finance.paymentFee),
      advertising: String(product.finance.advertising),
    },
    sizes: [...product.sizes],
    colors: product.colors.map((c) => ({ name: c.name, hex: c.hex })),
    images: product.images.map((i) => ({ url: i.url, alt: i.alt ?? '' })),
    stock,
    isActive: product.isActive,
  };
}

interface Props {
  open: boolean;
  product: AdminProduct | null;
  categories: Category[];
  suppliers: Array<{ id: number; name: string; country: string | null }>;
  onClose: () => void;
  onSaved: (product: AdminProduct) => void;
}

/** Форма товара: карточка + финансы + вариации + фотографии. */
export function ProductForm({ open, product, categories, suppliers, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft(categories[0]?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sizeInput, setSizeInput] = useState('S, M, L');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = product ? draftFromProduct(product) : emptyDraft(categories[0]?.id ?? '');
    setDraft(next);
    setSizeInput(next.sizes.join(', '));
    setErrors({});
  }, [open, product, categories]);

  const set = <K extends keyof ProductDraft>(field: K, value: ProductDraft[K]) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const setFinance = (field: keyof FinanceDraft, value: string) =>
    setDraft((prev) => ({ ...prev, finance: { ...prev.finance, [field]: value } }));

  /* ----------------------------- Расчёт финансов --------------------------- */
  const calc = useMemo(() => {
    const price = toNumber(draft.price);
    const cost = FINANCE_FIELDS.reduce((sum, f) => sum + toNumber(draft.finance[f.key]), 0);
    const profit = price - cost;
    const margin = price > 0 ? (profit / price) * 100 : 0;
    return { price, cost, profit, margin };
  }, [draft.price, draft.finance]);

  /* ------------------------------- Вариации -------------------------------- */
  const variantKeys = useMemo(
    () =>
      draft.sizes.flatMap((size) =>
        draft.colors.map((color) => ({ size, color: color.name, k: key(size, color.name) })),
      ),
    [draft.sizes, draft.colors],
  );

  function applySizes(value: string) {
    setSizeInput(value);
    const sizes = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    set('sizes', Array.from(new Set(sizes)));
  }

  function setColor(index: number, patch: Partial<ProductColor>) {
    setDraft((prev) => ({
      ...prev,
      colors: prev.colors.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function addColor() {
    setDraft((prev) => ({ ...prev, colors: [...prev.colors, { name: '', hex: '#000000' }] }));
  }

  function removeColor(index: number) {
    setDraft((prev) => ({ ...prev, colors: prev.colors.filter((_, i) => i !== index) }));
  }

  function setStock(k: string, value: string) {
    setDraft((prev) => ({ ...prev, stock: { ...prev.stock, [k]: value } }));
  }

  /** Заполнить все остатки одним числом. */
  function fillAllStock(value: string) {
    setDraft((prev) => {
      const stock = { ...prev.stock };
      for (const v of variantKeys) stock[v.k] = value;
      return { ...prev, stock };
    });
  }

  /* ------------------------------ Фотографии ------------------------------- */
  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { items } = await adminApi.uploadImages(Array.from(files).slice(0, 10));
      setDraft((prev) => ({
        ...prev,
        images: [...prev.images, ...items.map((i) => ({ url: i.url, alt: prev.name || '' }))],
      }));
      toast.success(`Загружено фотографий: ${items.length}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function addImageByUrl() {
    const url = window.prompt('URL изображения (например /uploads/products/photo.jpg)');
    if (!url) return;
    setDraft((prev) => ({ ...prev, images: [...prev.images, { url: url.trim(), alt: prev.name }] }));
  }

  function removeImage(index: number) {
    setDraft((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== index) }));
  }

  function makePrimary(index: number) {
    setDraft((prev) => {
      const images = [...prev.images];
      const [moved] = images.splice(index, 1);
      images.unshift(moved);
      return { ...prev, images };
    });
  }

  /* ------------------------------- Сохранение ------------------------------ */
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (draft.name.trim().length < 2) next.name = 'Минимум 2 символа';
    if (!draft.categoryId) next.categoryId = 'Выберите категорию';
    if (toNumber(draft.price) <= 0) next.price = 'Цена должна быть больше нуля';
    if (draft.sizes.length === 0) next.sizes = 'Укажите хотя бы один размер';
    if (draft.colors.length === 0 || draft.colors.some((c) => !c.name.trim()))
      next.colors = 'Укажите название каждого цвета';
    if (variantKeys.length === 0) next.variants = 'Нужны размеры и цвета';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (busy || !validate()) return;
    setBusy(true);

    const payload: ProductPayload = {
      name: draft.name.trim(),
      slug: draft.slug.trim() || undefined,
      brand: draft.brand.trim() || undefined,
      categoryId: Number(draft.categoryId),
      supplierId: draft.supplierId === '' ? null : Number(draft.supplierId),
      description: draft.description.trim() || undefined,
      composition: draft.composition.trim() || undefined,
      price: toNumber(draft.price),
      finance: Object.fromEntries(
        FINANCE_FIELDS.map((f) => [f.key, toNumber(draft.finance[f.key])]),
      ) as ProductPayload['finance'],
      images: draft.images.map((img) => ({ url: img.url, alt: img.alt || draft.name })),
      sizes: draft.sizes,
      colors: draft.colors.map((c) => ({ name: c.name.trim(), hex: c.hex || undefined })),
      variants: variantKeys.map((v) => ({
        size: v.size,
        color: v.color,
        stock: Number(draft.stock[v.k] ?? 0) || 0,
      })),
      isActive: draft.isActive,
    };

    try {
      const saved = product
        ? await adminApi.updateProduct(product.id, payload)
        : await adminApi.createProduct(payload);
      toast.success(product ? `Товар «${saved.name}» обновлён` : `Товар «${saved.name}» создан`);
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить товар');
    } finally {
      setBusy(false);
    }
  }

  const totalStock = variantKeys.reduce((sum, v) => sum + (Number(draft.stock[v.k] ?? 0) || 0), 0);

  return (
    <Modal
      open={open}
      wide
      title={product ? `Товар: ${product.name}` : 'Новый товар'}
      onClose={onClose}
      footer={
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>
            Себестоимость {formatPrice(calc.cost)} · прибыль {formatPrice(calc.profit)} ·{' '}
            {calc.margin.toFixed(1)} %
          </span>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="button" className="btn btn--accent" onClick={submit} disabled={busy}>
            {busy ? 'Сохраняем…' : product ? 'Сохранить изменения' : 'Создать товар'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 22 }}>
        {/* ------------------------------ Основное ---------------------------- */}
        <section>
          <h3 className="card-title">Основное</h3>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="pf-name">Название *</label>
              <input
                id="pf-name"
                className={`input ${errors.name ? 'input--error' : ''}`}
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Худи оверсайз с капюшоном"
              />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>

            <div className="field">
              <label htmlFor="pf-slug">Slug (адрес страницы)</label>
              <input
                id="pf-slug"
                className="input"
                value={draft.slug}
                onChange={(e) => set('slug', e.target.value)}
                placeholder="hoodie-oversize"
              />
              <span className="hint">Можно оставить пустым — сгенерируется из названия.</span>
            </div>

            <div className="field">
              <label htmlFor="pf-brand">Бренд</label>
              <input
                id="pf-brand"
                className="input"
                value={draft.brand}
                onChange={(e) => set('brand', e.target.value)}
                placeholder="Urban Line"
              />
            </div>

            <div className="field">
              <label htmlFor="pf-category">Категория *</label>
              <select
                id="pf-category"
                className={`input ${errors.categoryId ? 'input--error' : ''}`}
                value={draft.categoryId}
                onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— выберите —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.categoryId && <span className="field-error">{errors.categoryId}</span>}
            </div>

            <div className="field">
              <label htmlFor="pf-supplier">Поставщик</label>
              <select
                id="pf-supplier"
                className="input"
                value={draft.supplierId}
                onChange={(e) => set('supplierId', e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">— не указан —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.country ? ` (${s.country})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field span-2">
              <label htmlFor="pf-desc">Описание</label>
              <textarea
                id="pf-desc"
                className="input"
                rows={4}
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Плотный футер, начёс, свободный крой…"
              />
            </div>

            <div className="field">
              <label htmlFor="pf-comp">Состав</label>
              <input
                id="pf-comp"
                className="input"
                value={draft.composition}
                onChange={(e) => set('composition', e.target.value)}
                placeholder="80% хлопок, 20% полиэстер"
              />
            </div>

            <div className="field">
              <label htmlFor="pf-active">Статус</label>
              <label className="checkbox">
                <input
                  id="pf-active"
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                />
                <span>Активен (виден покупателям)</span>
              </label>
            </div>
          </div>
        </section>

        {/* ------------------------------- Финансы ---------------------------- */}
        <section>
          <h3 className="card-title">Цена и финансы (только для администратора)</h3>

          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="pf-price">Цена продажи, ₽ *</label>
              <input
                id="pf-price"
                className={`input ${errors.price ? 'input--error' : ''}`}
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="4490"
              />
              {errors.price && <span className="field-error">{errors.price}</span>}
            </div>
          </div>

          <div className="finance-grid">
            {FINANCE_FIELDS.map((field) => (
              <div className="field" key={field.key}>
                <label htmlFor={`pf-${field.key}`}>{field.label}, ₽</label>
                <input
                  id={`pf-${field.key}`}
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.finance[field.key]}
                  onChange={(e) => setFinance(field.key, e.target.value)}
                  placeholder="0"
                />
                <span className="hint">{field.hint}</span>
              </div>
            ))}
          </div>

          <div className="finance-total">
            <div>
              <span className="muted">Себестоимость = закупка + доставка + комиссии + прочие</span>
              <strong>{formatPrice(calc.cost)}</strong>
            </div>
            <div>
              <span className="muted">Прибыль = цена продажи − себестоимость</span>
              <strong className={calc.profit >= 0 ? 'num--accent' : 'num--danger'}>
                {formatPrice(calc.profit)}
              </strong>
            </div>
            <div>
              <span className="muted">Маржинальность = прибыль / цена × 100</span>
              <strong>{calc.margin.toFixed(1)} %</strong>
            </div>
          </div>
        </section>

        {/* --------------------------- Размеры и цвета ------------------------ */}
        <section>
          <h3 className="card-title">Размеры и цвета</h3>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="pf-sizes">Размеры (через запятую) *</label>
              <input
                id="pf-sizes"
                className={`input ${errors.sizes ? 'input--error' : ''}`}
                value={sizeInput}
                onChange={(e) => applySizes(e.target.value)}
                placeholder="XS, S, M, L, XL"
              />
              {errors.sizes && <span className="field-error">{errors.sizes}</span>}
            </div>

            <div className="field span-2">
              <label>Цвета *</label>
              <div className="col" style={{ gap: 8 }}>
                {draft.colors.map((color, index) => (
                  <div key={index} className="variants-editor__row" style={{ gridTemplateColumns: 'minmax(0,1fr) 120px auto' }}>
                    <input
                      className="input"
                      value={color.name}
                      onChange={(e) => setColor(index, { name: e.target.value })}
                      placeholder="Чёрный"
                      aria-label={`Цвет ${index + 1}`}
                    />
                    <input
                      className="input"
                      type="color"
                      value={color.hex || '#000000'}
                      onChange={(e) => setColor(index, { hex: e.target.value })}
                      aria-label={`Оттенок ${index + 1}`}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => removeColor(index)}
                      disabled={draft.colors.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {errors.colors && <span className="field-error">{errors.colors}</span>}
                <button type="button" className="btn btn--ghost btn--sm" onClick={addColor} style={{ alignSelf: 'flex-start' }}>
                  + Добавить цвет
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------- Остатки ---------------------------- */}
        <section>
          <div className="row row--between" style={{ marginBottom: 10 }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Остатки на складе · {variantKeys.length} вариаций
            </h3>
            <div className="row">
              <input
                className="input"
                style={{ width: 96 }}
                type="number"
                min={0}
                placeholder="10"
                aria-label="Заполнить все остатки"
                onChange={(e) => fillAllStock(e.target.value)}
              />
              <span className="muted small">всего: {totalStock} шт.</span>
            </div>
          </div>

          {variantKeys.length === 0 ? (
            <p className="alert alert--info">Добавьте размеры и цвета, чтобы задать остатки.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Размер</th>
                    <th>Цвет</th>
                    <th className="num">Остаток, шт.</th>
                    {product && <th>SKU</th>}
                  </tr>
                </thead>
                <tbody>
                  {variantKeys.map((v) => {
                    const existing = product?.variants.find(
                      (pv) => pv.size === v.size && pv.color === v.color,
                    );
                    return (
                      <tr key={v.k}>
                        <td>{v.size}</td>
                        <td>{v.color}</td>
                        <td className="num">
                          <input
                            className="input"
                            style={{ width: 96 }}
                            type="number"
                            min={0}
                            value={draft.stock[v.k] ?? ''}
                            onChange={(e) => setStock(v.k, e.target.value)}
                            placeholder="0"
                            aria-label={`Остаток ${v.size} ${v.color}`}
                          />
                        </td>
                        {product && <td className="mono">{existing?.sku ?? '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ------------------------------ Фотографии -------------------------- */}
        <section>
          <div className="row row--between" style={{ marginBottom: 10 }}>
            <h3 className="card-title" style={{ margin: 0 }}>
              Фотографии · {draft.images.length}
            </h3>
            <div className="row">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => uploadFiles(e.target.files)}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Загружаем…' : '⬆ Загрузить файлы'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={addImageByUrl}>
                + По ссылке
              </button>
            </div>
          </div>

          {draft.images.length === 0 ? (
            <p className="alert alert--info">
              Фотографий нет — в карточке товара будет показана заглушка.
            </p>
          ) : (
            <div className="images-editor">
              {draft.images.map((image, index) => (
                <div
                  key={`${image.url}-${index}`}
                  className={`images-editor__item ${index === 0 ? 'is-primary' : ''}`}
                >
                  <img src={image.url} alt={image.alt || draft.name} />
                  <button type="button" onClick={() => removeImage(index)} aria-label="Удалить фото">
                    ✕
                  </button>
                  {index !== 0 && (
                    <small onClick={() => makePrimary(index)} role="button" tabIndex={0}>
                      сделать главным
                    </small>
                  )}
                  {index === 0 && <small>главное</small>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
