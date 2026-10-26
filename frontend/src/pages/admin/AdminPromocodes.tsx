import { useCallback, useEffect, useState } from 'react';
import { formatDate, formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { Promocode } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { Modal } from '../../components/Modal';
import './Admin.css';

interface Draft {
  id: number | null;
  code: string;
  type: 'percent' | 'fixed';
  value: string;
  minOrder: string;
  maxUses: string;
  expiresAt: string;
  isActive: boolean;
}

const EMPTY: Draft = {
  id: null,
  code: '',
  type: 'percent',
  value: '10',
  minOrder: '0',
  maxUses: '',
  expiresAt: '',
  isActive: true,
};

function describe(promo: Promocode): string {
  const discount = promo.type === 'percent' ? `−${promo.value} %` : `−${formatPrice(promo.value)}`;
  const min = promo.minOrder > 0 ? ` от ${formatPrice(promo.minOrder)}` : '';
  return `${discount}${min}`;
}

function toDraft(promo: Promocode): Draft {
  return {
    id: promo.id,
    code: promo.code,
    type: promo.type,
    value: String(promo.value),
    minOrder: String(promo.minOrder),
    maxUses: promo.maxUses === null ? '' : String(promo.maxUses),
    expiresAt: promo.expiresAt ? promo.expiresAt.slice(0, 10) : '',
    isActive: promo.isActive,
  };
}

/** Промокоды: создание, редактирование, лимиты и срок действия. */
export default function AdminPromocodes() {
  const [items, setItems] = useState<Promocode[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Promocode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.promocodes();
      setItems(data.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить промокоды');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setDraft(EMPTY);
    setModalOpen(true);
  }

  function openEdit(promo: Promocode) {
    setDraft(toDraft(promo));
    setModalOpen(true);
  }

  async function save() {
    if (busy) return;
    const code = draft.code.trim().toUpperCase();
    const value = Number(draft.value.replace(',', '.'));
    if (code.length < 3) {
      toast.error('Код промокода: минимум 3 символа');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Значение скидки должно быть больше нуля');
      return;
    }
    if (draft.type === 'percent' && value > 90) {
      toast.error('Скидка в процентах не может превышать 90 %');
      return;
    }

    setBusy(true);
    const payload = {
      code,
      type: draft.type,
      value,
      minOrder: Number(draft.minOrder.replace(',', '.')) || 0,
      maxUses: draft.maxUses === '' ? null : Number(draft.maxUses),
      expiresAt: draft.expiresAt ? new Date(`${draft.expiresAt}T23:59:59`).toISOString() : null,
      isActive: draft.isActive,
    };

    try {
      if (draft.id) {
        await adminApi.updatePromocode(draft.id, payload);
        toast.success(`Промокод ${code} обновлён`);
      } else {
        await adminApi.createPromocode(payload);
        toast.success(`Промокод ${code} создан`);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить промокод');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(promo: Promocode) {
    try {
      await adminApi.updatePromocode(promo.id, { isActive: !promo.isActive });
      setItems((prev) => prev.map((p) => (p.id === promo.id ? { ...p, isActive: !p.isActive } : p)));
      toast.success(promo.isActive ? `Промокод ${promo.code} выключен` : `Промокод ${promo.code} включён`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить промокод');
    }
  }

  async function remove() {
    if (!removeTarget || busy) return;
    setBusy(true);
    try {
      const result = await adminApi.deletePromocode(removeTarget.id);
      toast.info(result.message ?? 'Промокод удалён');
      setItems((prev) => prev.filter((p) => p.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить промокод');
    } finally {
      setBusy(false);
    }
  }

  const active = items.filter((p) => p.isActive).length;
  const used = items.reduce((sum, p) => sum + p.usedCount, 0);

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Промокоды</h1>
          <p>Скидки применяются при оформлении заказа и уменьшают выручку</p>
        </div>
        <button type="button" className="btn btn--accent" onClick={openCreate}>
          + Новый промокод
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <div className="stat">
          <span className="stat__label">Всего промокодов</span>
          <span className="stat__value">{items.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Активных</span>
          <span className="stat__value">{active}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Применений</span>
          <span className="stat__value">{used}</span>
          <span className="stat__note">по всем заказам</span>
        </div>
      </div>

      {loading ? (
        <Loader label="Загружаем промокоды…" />
      ) : (
        <div className="admin-section admin-section--flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Скидка</th>
                  <th className="num">Мин. заказ</th>
                  <th className="num">Использован</th>
                  <th className="num">Лимит</th>
                  <th>Действует до</th>
                  <th>Создан</th>
                  <th>Статус</th>
                  <th className="actions">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">
                      Промокодов нет — создайте первый.
                    </td>
                  </tr>
                )}
                {items.map((promo) => {
                  const expired = promo.expiresAt !== null && new Date(promo.expiresAt) < new Date();
                  const exhausted = promo.leftUses !== null && promo.leftUses <= 0;
                  return (
                    <tr key={promo.id}>
                      <td>
                        <strong className="promo-code">{promo.code}</strong>
                      </td>
                      <td>{describe(promo)}</td>
                      <td className="num">
                        {promo.minOrder > 0 ? formatPrice(promo.minOrder) : 'без ограничений'}
                      </td>
                      <td className="num">{promo.usedCount}</td>
                      <td className="num">{promo.maxUses === null ? '∞' : promo.maxUses}</td>
                      <td className="small">
                        {promo.expiresAt ? formatDate(promo.expiresAt) : 'бессрочно'}
                      </td>
                      <td className="muted small">{formatDate(promo.createdAt)}</td>
                      <td>
                        {!promo.isActive ? (
                          <span className="badge">выключен</span>
                        ) : expired ? (
                          <span className="badge badge--danger">истёк</span>
                        ) : exhausted ? (
                          <span className="badge badge--warn">исчерпан</span>
                        ) : (
                          <span className="badge badge--ok">работает</span>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => openEdit(promo)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => toggleActive(promo)}
                          >
                            {promo.isActive ? 'Выключить' : 'Включить'}
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => setRemoveTarget(promo)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        title={draft.id ? `Промокод ${draft.code}` : 'Новый промокод'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setModalOpen(false)} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn btn--accent" onClick={save} disabled={busy}>
              {busy ? 'Сохраняем…' : draft.id ? 'Сохранить' : 'Создать'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="pm-code">Код *</label>
            <input
              id="pm-code"
              className="input promo-code"
              value={draft.code}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              placeholder="WINTER20"
            />
            <span className="hint">Покупатель вводит его на странице оформления заказа.</span>
          </div>

          <div className="field">
            <label htmlFor="pm-type">Тип скидки</label>
            <select
              id="pm-type"
              className="input"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as 'percent' | 'fixed' })}
            >
              <option value="percent">Процент от суммы</option>
              <option value="fixed">Фиксированная сумма, ₽</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="pm-value">{draft.type === 'percent' ? 'Размер, %' : 'Сумма, ₽'} *</label>
            <input
              id="pm-value"
              className="input"
              type="number"
              min={0}
              step={draft.type === 'percent' ? 1 : 100}
              value={draft.value}
              onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="pm-min">Минимальная сумма заказа, ₽</label>
            <input
              id="pm-min"
              className="input"
              type="number"
              min={0}
              step={100}
              value={draft.minOrder}
              onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })}
            />
            <span className="hint">0 — без ограничений.</span>
          </div>

          <div className="field">
            <label htmlFor="pm-uses">Лимит использований</label>
            <input
              id="pm-uses"
              className="input"
              type="number"
              min={1}
              value={draft.maxUses}
              onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
              placeholder="без лимита"
            />
          </div>

          <div className="field">
            <label htmlFor="pm-exp">Действует до</label>
            <input
              id="pm-exp"
              className="input"
              type="date"
              value={draft.expiresAt}
              onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="pm-active">Статус</label>
            <label className="checkbox">
              <input
                id="pm-active"
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              <span>Активен</span>
            </label>
          </div>
        </div>

        <p className="alert alert--info" style={{ marginTop: 16 }}>
          Скидка уменьшает сумму заказа, но не себестоимость: прибыль пересчитывается автоматически
          в отчёте «Аналитика».
        </p>
      </Modal>

      <Modal
        open={Boolean(removeTarget)}
        title="Удаление промокода"
        onClose={() => setRemoveTarget(null)}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setRemoveTarget(null)} disabled={busy}>
              Отмена
            </button>
            <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </button>
          </>
        }
      >
        {removeTarget && (
          <p>
            Удалить промокод <strong className="promo-code">{removeTarget.code}</strong>? Он
            использован {removeTarget.usedCount} раз. Заказы с этим промокодом останутся в истории.
          </p>
        )}
      </Modal>
    </>
  );
}
