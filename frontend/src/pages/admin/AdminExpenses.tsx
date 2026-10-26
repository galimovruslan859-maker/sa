import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import { PURCHASE_STATUS_TITLES } from '../../services/types';
import type { Expense, Purchase, Supplier } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { Modal } from '../../components/Modal';
import { ShareBars } from '../../components/BarChart';
import './Admin.css';

const EXPENSE_CATEGORIES = [
  { id: 'advertising', title: 'Реклама' },
  { id: 'logistics', title: 'Логистика' },
  { id: 'packaging', title: 'Упаковка' },
  { id: 'payment_fee', title: 'Эквайринг' },
  { id: 'rent', title: 'Аренда' },
  { id: 'salary', title: 'Зарплата' },
  { id: 'other', title: 'Прочее' },
] as const;

const CATEGORY_TITLE = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, c.title]));

const PURCHASE_STATUSES: Array<Purchase['status']> = [
  'draft',
  'ordered',
  'in_transit',
  'received',
  'cancelled',
];

interface ExpenseDraft {
  category: string;
  amount: string;
  title: string;
  note: string;
  date: string;
}

interface SupplierDraft {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  country: string;
  note: string;
}

interface PurchaseItemDraft {
  name: string;
  quantity: string;
  unitCost: string;
}

interface PurchaseDraft {
  supplierId: number | '';
  number: string;
  status: Purchase['status'];
  delivery: string;
  commission: string;
  customs: string;
  note: string;
  items: PurchaseItemDraft[];
}

const today = () => new Date().toISOString().slice(0, 10);

/** Расходы магазина, поставщики и закупки из Китая. */
export default function AdminExpenses() {
  const [tab, setTab] = useState<'expenses' | 'suppliers' | 'purchases'>('expenses');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);

  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    category: 'advertising',
    amount: '',
    title: '',
    note: '',
    date: today(),
  });
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft>({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    country: 'Китай',
    note: '',
  });
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>({
    supplierId: '',
    number: '',
    status: 'draft',
    delivery: '',
    commission: '',
    customs: '',
    note: '',
    items: [{ name: '', quantity: '1', unitCost: '' }],
  });
  const [expandedPurchase, setExpandedPurchase] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exp, sup, pur, prod] = await Promise.all([
        adminApi.expenses(),
        adminApi.suppliers(),
        adminApi.purchases(),
        adminApi.products({ limit: 200 }),
      ]);
      setExpenses(exp.items);
      setExpensesTotal(exp.total);
      setSuppliers(sup.items);
      setPurchases(pur.items);
      setProducts(prod.items.map((p) => ({ id: p.id, name: p.name })));
      if (sup.items.length > 0) {
        setPurchaseDraft((prev) => (prev.supplierId === '' ? { ...prev, supplierId: sup.items[0].id } : prev));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* -------------------------------- Расходы -------------------------------- */

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return Array.from(map.entries())
      .map(([category, amount]) => ({ label: CATEGORY_TITLE[category] ?? category, value: amount }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  async function addExpense(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amount = Number(expenseDraft.amount.replace(',', '.'));
    if (expenseDraft.title.trim().length < 2) {
      toast.error('Укажите название расхода');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Сумма должна быть больше нуля');
      return;
    }

    setBusy(true);
    try {
      await adminApi.createExpense({
        category: expenseDraft.category,
        amount,
        title: expenseDraft.title.trim(),
        note: expenseDraft.note.trim() || undefined,
        date: new Date(`${expenseDraft.date}T12:00:00`).toISOString(),
      });
      toast.success(`Расход «${expenseDraft.title.trim()}» добавлен`);
      setExpenseDraft({ category: 'advertising', amount: '', title: '', note: '', date: today() });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось добавить расход');
    } finally {
      setBusy(false);
    }
  }

  async function removeExpense(expense: Expense) {
    setBusy(true);
    try {
      await adminApi.deleteExpense(expense.id);
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id));
      setExpensesTotal((prev) => Math.max(0, prev - expense.amount));
      toast.info(`Расход «${expense.title}» удалён`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить расход');
    } finally {
      setBusy(false);
    }
  }

  /* ------------------------------- Поставщики ------------------------------ */

  async function addSupplier(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (supplierDraft.name.trim().length < 2) {
      toast.error('Укажите название поставщика');
      return;
    }
    setBusy(true);
    try {
      await adminApi.createSupplier({
        name: supplierDraft.name.trim(),
        contactName: supplierDraft.contactName.trim() || undefined,
        phone: supplierDraft.phone.trim() || undefined,
        email: supplierDraft.email.trim() || undefined,
        country: supplierDraft.country.trim() || undefined,
        note: supplierDraft.note.trim() || undefined,
      });
      toast.success(`Поставщик «${supplierDraft.name.trim()}» добавлен`);
      setSupplierModal(false);
      setSupplierDraft({ name: '', contactName: '', phone: '', email: '', country: 'Китай', note: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось добавить поставщика');
    } finally {
      setBusy(false);
    }
  }

  async function removeSupplier(supplier: Supplier) {
    setBusy(true);
    try {
      await adminApi.deleteSupplier(supplier.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== supplier.id));
      toast.info(`Поставщик «${supplier.name}» удалён`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить поставщика');
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------- Закупки -------------------------------- */

  const purchaseTotal = useMemo(
    () =>
      purchaseDraft.items.reduce(
        (sum, item) =>
          sum + (Number(item.quantity) || 0) * (Number(item.unitCost.replace(',', '.')) || 0),
        0,
      ) +
      (Number(purchaseDraft.delivery.replace(',', '.')) || 0) +
      (Number(purchaseDraft.commission.replace(',', '.')) || 0) +
      (Number(purchaseDraft.customs.replace(',', '.')) || 0),
    [purchaseDraft],
  );

  function setPurchaseItem(index: number, patch: Partial<PurchaseItemDraft>) {
    setPurchaseDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  async function addPurchase(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!purchaseDraft.supplierId) {
      toast.error('Выберите поставщика');
      return;
    }
    const items = purchaseDraft.items
      .map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity) || 0,
        unitCost: Number(item.unitCost.replace(',', '.')) || 0,
      }))
      .filter((item) => item.name.length >= 2 && item.quantity > 0);

    if (items.length === 0) {
      toast.error('Добавьте хотя бы одну позицию закупки');
      return;
    }

    setBusy(true);
    try {
      await adminApi.createPurchase({
        supplierId: purchaseDraft.supplierId,
        number: purchaseDraft.number.trim() || undefined,
        status: purchaseDraft.status,
        delivery: Number(purchaseDraft.delivery.replace(',', '.')) || 0,
        commission: Number(purchaseDraft.commission.replace(',', '.')) || 0,
        customs: Number(purchaseDraft.customs.replace(',', '.')) || 0,
        note: purchaseDraft.note.trim() || undefined,
        items,
      });
      toast.success('Закупка создана');
      setPurchaseModal(false);
      setPurchaseDraft((prev) => ({
        ...prev,
        number: '',
        note: '',
        items: [{ name: '', quantity: '1', unitCost: '' }],
      }));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать закупку');
    } finally {
      setBusy(false);
    }
  }

  async function changePurchaseStatus(purchase: Purchase, status: Purchase['status']) {
    setBusy(true);
    try {
      await adminApi.updatePurchaseStatus(purchase.id, status);
      toast.success(`Закупка ${purchase.number}: ${PURCHASE_STATUS_TITLES[status]}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить статус закупки');
    } finally {
      setBusy(false);
    }
  }

  const purchasesTotal = purchases
    .filter((p) => p.status !== 'cancelled')
    .reduce((sum, p) => sum + p.totalWithCosts, 0);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Расходы и закупки</h1>
          <p>Дополнительные расходы уменьшают прибыль магазина в отчёте «Аналитика»</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      <div className="tabs">
        <button type="button" className={tab === 'expenses' ? 'is-active' : ''} onClick={() => setTab('expenses')}>
          Расходы ({expenses.length})
        </button>
        <button type="button" className={tab === 'suppliers' ? 'is-active' : ''} onClick={() => setTab('suppliers')}>
          Поставщики ({suppliers.length})
        </button>
        <button type="button" className={tab === 'purchases' ? 'is-active' : ''} onClick={() => setTab('purchases')}>
          Закупки ({purchases.length})
        </button>
      </div>

      {loading ? (
        <Loader label="Загружаем данные…" />
      ) : (
        <>
          {/* ------------------------------- Расходы ------------------------------ */}
          {tab === 'expenses' && (
            <>
              <div className="stat-grid" style={{ marginBottom: 18 }}>
                <div className="stat stat--dark">
                  <span className="stat__label">Всего расходов</span>
                  <span className="stat__value">{formatPrice(expensesTotal)}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Записей</span>
                  <span className="stat__value">{expenses.length}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Средний расход</span>
                  <span className="stat__value">
                    {formatPrice(expenses.length ? expensesTotal / expenses.length : 0)}
                  </span>
                </div>
              </div>

              <div className="admin-grid-2">
                <div className="admin-section admin-section--flush">
                  <div className="admin-section__head">
                    <div>
                      <h2>Журнал расходов</h2>
                      <p>Реклама, аренда, упаковка, эквайринг, зарплата</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Название</th>
                          <th>Категория</th>
                          <th className="num">Сумма</th>
                          <th className="actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.length === 0 && (
                          <tr>
                            <td colSpan={5} className="muted">
                              Расходов пока нет.
                            </td>
                          </tr>
                        )}
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td className="muted small">{formatDate(expense.date)}</td>
                            <td>
                              <strong>{expense.title}</strong>
                              {expense.note && <div className="muted small">{expense.note}</div>}
                            </td>
                            <td>
                              <span className="badge">{CATEGORY_TITLE[expense.category] ?? expense.category}</span>
                            </td>
                            <td className="num">
                              <strong>{formatPrice(expense.amount)}</strong>
                            </td>
                            <td>
                              <div className="actions">
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => removeExpense(expense)}
                                  disabled={busy}
                                >
                                  Удалить
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="col">
                  <div className="admin-section">
                    <h2 className="card-title">Структура расходов</h2>
                    <ShareBars items={byCategory} format={formatPrice} />
                  </div>

                  <form className="admin-section" onSubmit={addExpense}>
                    <h2 className="card-title">Добавить расход</h2>
                    <div className="form-grid">
                      <div className="field span-2">
                        <label htmlFor="ex-title">Название *</label>
                        <input
                          id="ex-title"
                          className="input"
                          value={expenseDraft.title}
                          onChange={(e) => setExpenseDraft({ ...expenseDraft, title: e.target.value })}
                          placeholder="Реклама ВКонтакте"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="ex-cat">Категория</label>
                        <select
                          id="ex-cat"
                          className="input"
                          value={expenseDraft.category}
                          onChange={(e) => setExpenseDraft({ ...expenseDraft, category: e.target.value })}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="ex-amount">Сумма, ₽ *</label>
                        <input
                          id="ex-amount"
                          className="input"
                          type="number"
                          min={0}
                          step="0.01"
                          value={expenseDraft.amount}
                          onChange={(e) => setExpenseDraft({ ...expenseDraft, amount: e.target.value })}
                          placeholder="15000"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="ex-date">Дата</label>
                        <input
                          id="ex-date"
                          className="input"
                          type="date"
                          value={expenseDraft.date}
                          onChange={(e) => setExpenseDraft({ ...expenseDraft, date: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="ex-note">Комментарий</label>
                        <input
                          id="ex-note"
                          className="input"
                          value={expenseDraft.note}
                          onChange={(e) => setExpenseDraft({ ...expenseDraft, note: e.target.value })}
                          placeholder="Таргет на худи"
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn btn--accent" disabled={busy} style={{ marginTop: 14 }}>
                      {busy ? 'Добавляем…' : 'Добавить расход'}
                    </button>
                  </form>
                </div>
              </div>
            </>
          )}

          {/* ------------------------------ Поставщики ---------------------------- */}
          {tab === 'suppliers' && (
            <div className="admin-grid-2">
              <div className="admin-section admin-section--flush">
                <div className="admin-section__head">
                  <div>
                    <h2>Поставщики из Китая</h2>
                    <p>К ним привязаны товары и закупки</p>
                  </div>
                  <button type="button" className="btn btn--accent btn--sm" onClick={() => setSupplierModal(true)}>
                    + Поставщик
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Название</th>
                        <th>Контакт</th>
                        <th>Страна</th>
                        <th className="num">Товаров</th>
                        <th className="num">Закупок</th>
                        <th className="actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {suppliers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="muted">
                            Поставщиков нет.
                          </td>
                        </tr>
                      )}
                      {suppliers.map((supplier) => (
                        <tr key={supplier.id}>
                          <td>
                            <strong>{supplier.name}</strong>
                            {supplier.note && <div className="muted small">{supplier.note}</div>}
                          </td>
                          <td className="small">
                            {supplier.contactName ?? '—'}
                            {supplier.phone && <div className="muted small">{supplier.phone}</div>}
                            {supplier.email && <div className="muted small">{supplier.email}</div>}
                          </td>
                          <td className="small">{supplier.country ?? '—'}</td>
                          <td className="num">{supplier._count?.products ?? 0}</td>
                          <td className="num">{supplier._count?.purchases ?? 0}</td>
                          <td>
                            <div className="actions">
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => removeSupplier(supplier)}
                                disabled={busy || (supplier._count?.products ?? 0) > 0}
                                title={
                                  (supplier._count?.products ?? 0) > 0
                                    ? 'Сначала открепите товары'
                                    : 'Удалить поставщика'
                                }
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="admin-section">
                <h2 className="card-title">Как поставщик влияет на финансы</h2>
                <p className="muted small">
                  Закупочная цена товара указывается в карточке товара (раздел «Товары» → «Изменить»).
                  Она вместе с доставкой из Китая, комиссией посредника, таможней, упаковкой,
                  эквайрингом и рекламой формирует себестоимость:
                </p>
                <div className="form-note" style={{ marginTop: 12 }}>
                  <strong>Себестоимость</strong>
                  закупка + доставка + комиссия + таможня + упаковка + эквайринг + реклама
                </div>
                <div className="form-note" style={{ marginTop: 10 }}>
                  <strong>Прибыль</strong>
                  цена продажи − себестоимость
                </div>
                <div className="form-note" style={{ marginTop: 10 }}>
                  <strong>Маржинальность</strong>
                  прибыль / цена продажи × 100 %
                </div>
              </div>
            </div>
          )}

          {/* -------------------------------- Закупки ----------------------------- */}
          {tab === 'purchases' && (
            <>
              <div className="stat-grid" style={{ marginBottom: 18 }}>
                <div className="stat stat--dark">
                  <span className="stat__label">Закуплено на</span>
                  <span className="stat__value">{formatPrice(purchasesTotal)}</span>
                  <span className="stat__note">с учётом доставки и таможни</span>
                </div>
                <div className="stat">
                  <span className="stat__label">Партий</span>
                  <span className="stat__value">{purchases.length}</span>
                </div>
                <div className="stat">
                  <span className="stat__label">В пути</span>
                  <span className="stat__value">
                    {purchases.filter((p) => p.status === 'in_transit' || p.status === 'ordered').length}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Получено</span>
                  <span className="stat__value">{purchases.filter((p) => p.status === 'received').length}</span>
                </div>
              </div>

              <div className="admin-section admin-section--flush">
                <div className="admin-section__head">
                  <div>
                    <h2>Партии закупки</h2>
                    <p>Нажмите на строку, чтобы увидеть состав партии</p>
                  </div>
                  <button type="button" className="btn btn--accent btn--sm" onClick={() => setPurchaseModal(true)}>
                    + Новая закупка
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Номер</th>
                        <th>Поставщик</th>
                        <th>Дата</th>
                        <th className="num">Товары</th>
                        <th className="num">Доставка</th>
                        <th className="num">Комиссия</th>
                        <th className="num">Таможня</th>
                        <th className="num">Итого</th>
                        <th>Статус</th>
                        <th className="actions">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.length === 0 && (
                        <tr>
                          <td colSpan={10} className="muted">
                            Закупок пока нет.
                          </td>
                        </tr>
                      )}
                      {purchases.map((purchase) => (
                        <tr key={purchase.id} onClick={() => setExpandedPurchase(expandedPurchase === purchase.id ? null : purchase.id)}>
                          <td>
                            <strong>{purchase.number}</strong>
                          </td>
                          <td className="small">{purchase.supplier.name}</td>
                          <td className="muted small">{formatDate(purchase.orderDate)}</td>
                          <td className="num">{formatPrice(purchase.total)}</td>
                          <td className="num">{formatPrice(purchase.delivery)}</td>
                          <td className="num">{formatPrice(purchase.commission)}</td>
                          <td className="num">{formatPrice(purchase.customs)}</td>
                          <td className="num">
                            <strong>{formatPrice(purchase.totalWithCosts)}</strong>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                purchase.status === 'received'
                                  ? 'badge--ok'
                                  : purchase.status === 'cancelled'
                                    ? 'badge--danger'
                                    : 'badge--warn'
                              }`}
                            >
                              {PURCHASE_STATUS_TITLES[purchase.status]}
                            </span>
                          </td>
                          <td>
                            <div className="actions" onClick={(e) => e.stopPropagation()}>
                              <select
                                className="input"
                                style={{ width: 'auto', padding: '6px 8px', fontSize: 'var(--fs-xs)' }}
                                value={purchase.status}
                                onChange={(e) =>
                                  changePurchaseStatus(purchase, e.target.value as Purchase['status'])
                                }
                                disabled={busy}
                                aria-label={`Статус закупки ${purchase.number}`}
                              >
                                {PURCHASE_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {PURCHASE_STATUS_TITLES[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {expandedPurchase && (
                <div className="admin-section">
                  <h2 className="card-title">
                    Состав партии {purchases.find((p) => p.id === expandedPurchase)?.number}
                  </h2>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Позиция</th>
                          <th className="num">Кол-во</th>
                          <th className="num">Закупка/ед.</th>
                          <th className="num">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases
                          .find((p) => p.id === expandedPurchase)
                          ?.items.map((item) => (
                            <tr key={item.id}>
                              <td>{item.name}</td>
                              <td className="num">{item.quantity}</td>
                              <td className="num">{formatPrice(item.unitCost)}</td>
                              <td className="num">{formatPrice(item.sum)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ------------------------------ Модалки ------------------------------- */}
      <Modal
        open={supplierModal}
        title="Новый поставщик"
        onClose={() => setSupplierModal(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setSupplierModal(false)} disabled={busy}>
              Отмена
            </button>
          </>
        }
      >
        <form onSubmit={addSupplier}>
          <div className="form-grid">
            <div className="field span-2">
              <label htmlFor="sp-name">Название *</label>
              <input
                id="sp-name"
                className="input"
                value={supplierDraft.name}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })}
                placeholder="Guangzhou Fashion Trade Co."
              />
            </div>
            <div className="field">
              <label htmlFor="sp-contact">Контактное лицо</label>
              <input
                id="sp-contact"
                className="input"
                value={supplierDraft.contactName}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, contactName: e.target.value })}
                placeholder="Ли Вэй"
              />
            </div>
            <div className="field">
              <label htmlFor="sp-country">Страна</label>
              <input
                id="sp-country"
                className="input"
                value={supplierDraft.country}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, country: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-phone">Телефон / WeChat</label>
              <input
                id="sp-phone"
                className="input"
                value={supplierDraft.phone}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="sp-email">E-mail</label>
              <input
                id="sp-email"
                className="input"
                type="email"
                value={supplierDraft.email}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, email: e.target.value })}
              />
            </div>
            <div className="field span-2">
              <label htmlFor="sp-note">Заметка</label>
              <input
                id="sp-note"
                className="input"
                value={supplierDraft.note}
                onChange={(e) => setSupplierDraft({ ...supplierDraft, note: e.target.value })}
                placeholder="Работаем с 2023 года, отгрузка раз в две недели"
              />
            </div>
          </div>
          <button type="submit" className="btn btn--accent" disabled={busy} style={{ marginTop: 16 }}>
            {busy ? 'Добавляем…' : 'Добавить поставщика'}
          </button>
        </form>
      </Modal>

      <Modal
        open={purchaseModal}
        wide
        title="Новая закупка"
        onClose={() => setPurchaseModal(false)}
        footer={
          <>
            <span className="muted small" style={{ marginRight: 'auto' }}>
              Итого с расходами: <strong>{formatPrice(purchaseTotal)}</strong>
            </span>
            <button type="button" className="btn btn--ghost" onClick={() => setPurchaseModal(false)} disabled={busy}>
              Отмена
            </button>
          </>
        }
      >
        <form onSubmit={addPurchase}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pu-supplier">Поставщик *</label>
              <select
                id="pu-supplier"
                className="input"
                value={purchaseDraft.supplierId}
                onChange={(e) =>
                  setPurchaseDraft({
                    ...purchaseDraft,
                    supplierId: e.target.value ? Number(e.target.value) : '',
                  })
                }
              >
                <option value="">— выберите —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pu-number">Номер партии</label>
              <input
                id="pu-number"
                className="input"
                value={purchaseDraft.number}
                onChange={(e) => setPurchaseDraft({ ...purchaseDraft, number: e.target.value })}
                placeholder="PUR-0007"
              />
            </div>
            <div className="field">
              <label htmlFor="pu-status">Статус</label>
              <select
                id="pu-status"
                className="input"
                value={purchaseDraft.status}
                onChange={(e) =>
                  setPurchaseDraft({ ...purchaseDraft, status: e.target.value as Purchase['status'] })
                }
              >
                {PURCHASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {PURCHASE_STATUS_TITLES[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pu-delivery">Доставка из Китая, ₽</label>
              <input
                id="pu-delivery"
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={purchaseDraft.delivery}
                onChange={(e) => setPurchaseDraft({ ...purchaseDraft, delivery: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="pu-commission">Комиссия посредника, ₽</label>
              <input
                id="pu-commission"
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={purchaseDraft.commission}
                onChange={(e) => setPurchaseDraft({ ...purchaseDraft, commission: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="pu-customs">Таможня, ₽</label>
              <input
                id="pu-customs"
                className="input"
                type="number"
                min={0}
                step="0.01"
                value={purchaseDraft.customs}
                onChange={(e) => setPurchaseDraft({ ...purchaseDraft, customs: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <h3 className="card-title" style={{ marginTop: 20 }}>
            Позиции закупки
          </h3>
          <div className="variants-editor">
            {purchaseDraft.items.map((item, index) => (
              <div key={index} className="variants-editor__row">
                <input
                  className="input"
                  list="purchase-products"
                  value={item.name}
                  onChange={(e) => setPurchaseItem(index, { name: e.target.value })}
                  placeholder="Название позиции"
                  aria-label={`Позиция ${index + 1}`}
                />
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => setPurchaseItem(index, { quantity: e.target.value })}
                  aria-label={`Количество ${index + 1}`}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitCost}
                  onChange={(e) => setPurchaseItem(index, { unitCost: e.target.value })}
                  placeholder="₽/ед."
                  aria-label={`Цена за единицу ${index + 1}`}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() =>
                    setPurchaseDraft((prev) => ({
                      ...prev,
                      items: prev.items.filter((_, i) => i !== index),
                    }))
                  }
                  disabled={purchaseDraft.items.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <datalist id="purchase-products">
            {products.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          <div className="row" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() =>
                setPurchaseDraft((prev) => ({
                  ...prev,
                  items: [...prev.items, { name: '', quantity: '1', unitCost: '' }],
                }))
              }
            >
              + Добавить позицию
            </button>
            <span className="muted small">Итого за товары: {formatPrice(purchaseTotal)}</span>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="pu-note">Комментарий</label>
            <input
              id="pu-note"
              className="input"
              value={purchaseDraft.note}
              onChange={(e) => setPurchaseDraft({ ...purchaseDraft, note: e.target.value })}
              placeholder="Партия зимней одежды"
            />
          </div>

          <button type="submit" className="btn btn--accent" disabled={busy} style={{ marginTop: 16 }}>
            {busy ? 'Создаём…' : 'Создать закупку'}
          </button>
        </form>
      </Modal>
    </>
  );
}
