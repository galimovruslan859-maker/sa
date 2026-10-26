import { useEffect, useState } from 'react';
import { adminApi } from '../../services/endpoints';
import type { Category } from '../../services/types';
import { toast } from '../../store/toast.store';
import { Modal } from '../../components/Modal';

interface Props {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}

interface Draft {
  id: number | null;
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY: Draft = { id: null, name: '', slug: '', description: '', sortOrder: '', isActive: true };

/** Управление категориями: создание, редактирование, удаление. */
export function CategoriesModal({ open, categories, onClose, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<Category | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setConfirmId(null);
    }
  }, [open]);

  function startEdit(category: Category) {
    setDraft({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      sortOrder: String(category.sortOrder),
      isActive: category.isActive,
    });
  }

  async function save() {
    if (busy) return;
    if (draft.name.trim().length < 2) {
      toast.error('Название категории: минимум 2 символа');
      return;
    }

    setBusy(true);
    const payload = {
      name: draft.name.trim(),
      slug: draft.slug.trim() || undefined,
      description: draft.description.trim() || undefined,
      sortOrder: draft.sortOrder === '' ? undefined : Number(draft.sortOrder),
      isActive: draft.isActive,
    };

    try {
      if (draft.id) {
        await adminApi.updateCategory(draft.id, payload);
        toast.success(`Категория «${payload.name}» обновлена`);
      } else {
        await adminApi.createCategory(payload);
        toast.success(`Категория «${payload.name}» создана`);
      }
      setDraft(EMPTY);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить категорию');
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category) {
    setBusy(true);
    try {
      await adminApi.deleteCategory(category.id);
      toast.info(`Категория «${category.name}» удалена`);
      setConfirmId(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить категорию');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Категории товаров"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      <div className="col" style={{ gap: 20 }}>
        <section>
          <h3 className="card-title">{draft.id ? `Редактирование #${draft.id}` : 'Новая категория'}</h3>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cat-name">Название *</label>
              <input
                id="cat-name"
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Куртки"
              />
            </div>
            <div className="field">
              <label htmlFor="cat-slug">Slug</label>
              <input
                id="cat-slug"
                className="input"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="kurtki"
              />
            </div>
            <div className="field span-2">
              <label htmlFor="cat-desc">Описание</label>
              <input
                id="cat-desc"
                className="input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Верхняя одежда на зиму и межсезонье"
              />
            </div>
            <div className="field">
              <label htmlFor="cat-order">Порядок</label>
              <input
                id="cat-order"
                className="input"
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="field">
              <label htmlFor="cat-active">Статус</label>
              <label className="checkbox">
                <input
                  id="cat-active"
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                />
                <span>Активна</span>
              </label>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn btn--accent" onClick={save} disabled={busy}>
              {busy ? 'Сохраняем…' : draft.id ? 'Сохранить' : 'Добавить категорию'}
            </button>
            {draft.id && (
              <button type="button" className="btn btn--ghost" onClick={() => setDraft(EMPTY)}>
                Очистить форму
              </button>
            )}
          </div>
        </section>

        <section className="admin-section--flush" style={{ border: '1px solid var(--c-line)', borderRadius: 'var(--radius-lg)' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Slug</th>
                  <th className="num">Товаров</th>
                  <th className="num">Порядок</th>
                  <th>Статус</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                      {category.description && (
                        <div className="muted small">{category.description}</div>
                      )}
                    </td>
                    <td className="mono">{category.slug}</td>
                    <td className="num">{category.productsCount}</td>
                    <td className="num">{category.sortOrder}</td>
                    <td>
                      {category.isActive ? (
                        <span className="badge badge--ok">активна</span>
                      ) : (
                        <span className="badge">скрыта</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => startEdit(category)}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setConfirmId(category)}
                          disabled={category.productsCount > 0}
                          title={
                            category.productsCount > 0
                              ? 'Сначала перенесите товары в другую категорию'
                              : 'Удалить категорию'
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
        </section>

        {confirmId && (
          <div className="alert alert--error row row--between">
            <span>
              Удалить категорию «{confirmId.name}»? Действие нельзя отменить.
            </span>
            <span className="row">
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => remove(confirmId)}
                disabled={busy}
              >
                Удалить
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmId(null)}>
                Отмена
              </button>
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
