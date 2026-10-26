import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDate, formatPrice } from '../../services/api';
import { adminApi } from '../../services/endpoints';
import type { AdminUser, Pagination, Role } from '../../services/types';
import { useAuthStore } from '../../store/auth.store';
import { toast } from '../../store/toast.store';
import { Loader } from '../../components/Loader';
import { PaginationNav } from '../../components/Pagination';
import { Modal } from '../../components/Modal';
import './Admin.css';

const PER_PAGE = 15;

/** Пользователи: список, роли, блокировка. */
export default function AdminUsers() {
  const [params, setParams] = useSearchParams();
  const currentUser = useAuthStore((s) => s.user);

  const q = params.get('q') ?? '';
  const role = (params.get('role') as Role | null) ?? null;
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(q);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ user: AdminUser; action: 'role' | 'block' } | null>(null);

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
      const data = await adminApi.users({ q: q || undefined, role: role ?? undefined, page, limit: PER_PAGE });
      setUsers(data.items);
      setPagination(data.pagination);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, [q, role, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setSearchInput(q), [q]);

  async function apply(user: AdminUser, patch: { role?: Role; isActive?: boolean }) {
    setBusyId(user.id);
    try {
      const updated = await adminApi.updateUser(user.id, patch);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      toast.success(
        patch.role
          ? `Роль ${user.email}: ${patch.role === 'ADMIN' ? 'администратор' : 'покупатель'}`
          : patch.isActive
            ? `Аккаунт ${updated.email} разблокирован`
            : `Аккаунт ${updated.email} заблокирован`,
      );
      setConfirmTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить пользователя');
    } finally {
      setBusyId(null);
    }
  }

  const stats = users.reduce(
    (acc, u) => ({
      admins: acc.admins + (u.role === 'ADMIN' ? 1 : 0),
      blocked: acc.blocked + (u.isActive ? 0 : 1),
      spent: acc.spent + u.totalSpent,
    }),
    { admins: 0, blocked: 0, spent: 0 },
  );

  return (
    <>
      <div className="admin-page-head">
        <div>
          <h1>Пользователи</h1>
          <p>
            {pagination ? `${pagination.total} учётных записей` : 'База покупателей и администраторов'}
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
            placeholder="E-mail, имя, телефон"
            aria-label="Поиск пользователей"
          />
        </form>

        <div className="segmented">
          {(['all', 'CUSTOMER', 'ADMIN'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={(role ?? 'all') === value ? 'is-active' : ''}
              onClick={() => update({ role: value === 'all' ? null : value, page: null })}
            >
              {value === 'all' ? 'Все' : value === 'ADMIN' ? 'Администраторы' : 'Покупатели'}
            </button>
          ))}
        </div>

        <span className="admin-toolbar__spacer" />

        {(q || role) && (
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
          <span className="stat__label">Администраторов</span>
          <span className="stat__value">{stats.admins}</span>
          <span className="stat__note">на текущей странице</span>
        </div>
        <div className="stat">
          <span className="stat__label">Заблокировано</span>
          <span className="stat__value">{stats.blocked}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Сумма покупок</span>
          <span className="stat__value">{formatPrice(stats.spent)}</span>
          <span className="stat__note">по оплаченным заказам</span>
        </div>
      </div>

      {loading ? (
        <Loader label="Загружаем пользователей…" />
      ) : (
        <>
          <div className="admin-section admin-section--flush">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Контакты</th>
                    <th>Роль</th>
                    <th>Регистрация</th>
                    <th className="num">Заказов</th>
                    <th className="num">Отзывов</th>
                    <th className="num">Избранное</th>
                    <th className="num">Потрачено</th>
                    <th>Статус</th>
                    <th className="actions">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={10} className="muted">
                        Пользователи не найдены.
                      </td>
                    </tr>
                  )}
                  {users.map((user) => {
                    const isSelf = currentUser?.id === user.id;
                    return (
                      <tr key={user.id}>
                        <td>
                          <strong>
                            {user.firstName} {user.lastName ?? ''}
                          </strong>
                          {isSelf && <span className="badge badge--dark" style={{ marginLeft: 6 }}>вы</span>}
                          <div className="muted small">ID {user.id}</div>
                        </td>
                        <td className="small">
                          <a href={`mailto:${user.email}`}>{user.email}</a>
                          {user.phone && <div className="muted small">{user.phone}</div>}
                        </td>
                        <td>
                          {user.role === 'ADMIN' ? (
                            <span className="badge badge--accent">ADMIN</span>
                          ) : (
                            <span className="badge">CUSTOMER</span>
                          )}
                        </td>
                        <td className="muted small">{formatDate(user.createdAt)}</td>
                        <td className="num">
                          {user.ordersCount > 0 ? (
                            <Link to={`/admin/orders?q=${encodeURIComponent(user.email)}`}>
                              {user.ordersCount}
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="num">{user.reviewsCount}</td>
                        <td className="num">{user.favoritesCount}</td>
                        <td className="num">{formatPrice(user.totalSpent)}</td>
                        <td>
                          {user.isActive ? (
                            <span className="badge badge--ok">активен</span>
                          ) : (
                            <span className="badge badge--danger">заблокирован</span>
                          )}
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setConfirmTarget({ user, action: 'role' })}
                              disabled={isSelf || busyId === user.id}
                              title={isSelf ? 'Свою роль изменить нельзя' : 'Изменить роль'}
                            >
                              {user.role === 'ADMIN' ? 'В покупатели' : 'В админы'}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setConfirmTarget({ user, action: 'block' })}
                              disabled={isSelf || busyId === user.id}
                            >
                              {user.isActive ? 'Заблокировать' : 'Разблокировать'}
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

          {pagination && <PaginationNav pagination={pagination} onChange={(p) => update({ page: String(p) })} />}
        </>
      )}

      <Modal
        open={Boolean(confirmTarget)}
        title={confirmTarget?.action === 'role' ? 'Изменение роли' : 'Блокировка аккаунта'}
        onClose={() => setConfirmTarget(null)}
        footer={
          confirmTarget && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmTarget(null)}>
                Отмена
              </button>
              <button
                type="button"
                className={`btn ${confirmTarget.action === 'block' && confirmTarget.user.isActive ? 'btn--danger' : 'btn--accent'}`}
                onClick={() =>
                  apply(
                    confirmTarget.user,
                    confirmTarget.action === 'role'
                      ? { role: confirmTarget.user.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' }
                      : { isActive: !confirmTarget.user.isActive },
                  )
                }
                disabled={busyId === confirmTarget.user.id}
              >
                Подтвердить
              </button>
            </>
          )
        }
      >
        {confirmTarget && (
          <div className="col">
            <p>
              Пользователь: <strong>{confirmTarget.user.email}</strong> (
              {confirmTarget.user.firstName} {confirmTarget.user.lastName ?? ''}).
            </p>
            {confirmTarget.action === 'role' ? (
              <p className="alert alert--info">
                Новая роль:{' '}
                <strong>
                  {confirmTarget.user.role === 'ADMIN' ? 'Покупатель' : 'Администратор'}
                </strong>
                . Администратор получает доступ к себестоимости, прибыли и всем разделам панели.
              </p>
            ) : confirmTarget.user.isActive ? (
              <p className="alert alert--error">
                Заблокированный пользователь не сможет войти: API вернёт «Аккаунт заблокирован».
                История заказов сохранится.
              </p>
            ) : (
              <p className="alert alert--ok">Аккаунт снова сможет входить и оформлять заказы.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
