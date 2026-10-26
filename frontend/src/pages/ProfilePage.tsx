import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiRequestError, fieldErrors, formatDate } from '../services/api';
import { authApi, reviewApi } from '../services/endpoints';
import type { Review } from '../services/types';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import { Rating } from '../components/Rating';
import { EmptyState, Loader } from '../components/Loader';
import './ProfilePage.css';

type ReviewWithProduct = Review & { product: { id: number; name: string; slug: string } };

interface Stats {
  ordersCount: number;
  favoritesCount: number;
  reviewsCount: number;
  cartCount: number;
}

/** Личный кабинет: данные, статистика, отзывы, смена пароля. */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();

  const [stats, setStats] = useState<Stats | null>(null);
  const [reviews, setReviews] = useState<ReviewWithProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'data' | 'password'>('data');

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
  });
  const [passwords, setPasswords] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const [me, mine] = await Promise.all([authApi.me(), reviewApi.mine()]);
        if (!alive) return;
        setStats(me.stats);
        setReviews(mine.items as ReviewWithProduct[]);
      } catch {
        if (alive) toast.error('Не удалось загрузить данные профиля');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return <Navigate to="/login?next=/profile" replace />;

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !user) return;

    const nextErrors: Record<string, string> = {};
    if (form.firstName.trim().length < 2) nextErrors.firstName = 'Минимум 2 символа';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const { user: updated } = await authApi.updateMe({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
      });
      setUser(updated);
      toast.success('Данные профиля сохранены');
    } catch (err) {
      if (err instanceof ApiRequestError) setErrors(fieldErrors(err.details));
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить данные');
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const nextErrors: Record<string, string> = {};
    if (passwords.password.length < 6) nextErrors.password = 'Минимум 6 символов';
    if (passwords.confirm !== passwords.password) nextErrors.confirm = 'Пароли не совпадают';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      await authApi.updateMe({ password: passwords.password });
      setPasswords({ password: '', confirm: '' });
      toast.success('Пароль изменён');
    } catch (err) {
      if (err instanceof ApiRequestError) setErrors(fieldErrors(err.details));
      toast.error(err instanceof Error ? err.message : 'Не удалось изменить пароль');
    } finally {
      setBusy(false);
    }
  }

  async function removeReview(id: number) {
    try {
      await reviewApi.remove(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => (prev ? { ...prev, reviewsCount: Math.max(0, prev.reviewsCount - 1) } : prev));
      toast.info('Отзыв удалён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить отзыв');
    }
  }

  async function handleLogout() {
    await logout();
    useCartStore.getState().reset();
    useFavoriteStore.getState().reset();
    toast.info('Вы вышли из аккаунта');
    navigate('/');
  }

  const initials = `${user.firstName.slice(0, 1)}${user.lastName?.slice(0, 1) ?? ''}`.toUpperCase();

  return (
    <div className="container">
      <div className="profile-head card">
        <span className="profile-head__avatar">{initials || 'R'}</span>
        <div className="profile-head__text">
          <h1>
            {user.firstName} {user.lastName ?? ''}
          </h1>
          <p className="muted small">
            {user.email}
            {user.phone ? ` · ${user.phone}` : ''} · в магазине с {formatDate(user.createdAt)}
          </p>
          <div className="row" style={{ marginTop: 8 }}>
            {user.role === 'ADMIN' ? (
              <span className="badge badge--accent">Администратор</span>
            ) : (
              <span className="badge">Покупатель</span>
            )}
            {user.isActive ? (
              <span className="badge badge--ok">Аккаунт активен</span>
            ) : (
              <span className="badge badge--danger">Заблокирован</span>
            )}
          </div>
        </div>
        <div className="profile-head__actions col">
          {user.role === 'ADMIN' && (
            <Link to="/admin" className="btn btn--accent">
              Админ-панель
            </Link>
          )}
          <Link to="/orders" className="btn btn--ghost">
            Мои заказы
          </Link>
          <button type="button" className="btn btn--ghost btn--danger-text" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </div>

      <div className="stat-grid profile-stats">
        <Link to="/orders" className="stat">
          <span className="stat__label">Заказов</span>
          <span className="stat__value">{stats?.ordersCount ?? '—'}</span>
          <span className="stat__note">история и статусы</span>
        </Link>
        <Link to="/favorites" className="stat">
          <span className="stat__label">В избранном</span>
          <span className="stat__value">{stats?.favoritesCount ?? '—'}</span>
          <span className="stat__note">сохранённые товары</span>
        </Link>
        <div className="stat">
          <span className="stat__label">Отзывов</span>
          <span className="stat__value">{stats?.reviewsCount ?? '—'}</span>
          <span className="stat__note">оценки покупок</span>
        </div>
        <Link to="/cart" className="stat">
          <span className="stat__label">В корзине</span>
          <span className="stat__value">{stats?.cartCount ?? '—'}</span>
          <span className="stat__note">штук товаров</span>
        </Link>
      </div>

      <div className="profile-grid">
        <section className="card">
          <div className="tabs">
            <button
              type="button"
              className={tab === 'data' ? 'is-active' : ''}
              onClick={() => setTab('data')}
            >
              Личные данные
            </button>
            <button
              type="button"
              className={tab === 'password' ? 'is-active' : ''}
              onClick={() => setTab('password')}
            >
              Пароль
            </button>
          </div>

          {tab === 'data' ? (
            <form className="col" onSubmit={saveProfile} noValidate>
              <div className="field">
                <label htmlFor="pf-first">Имя *</label>
                <input
                  id="pf-first"
                  className={`input ${errors.firstName ? 'input--error' : ''}`}
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  disabled={busy}
                />
                {errors.firstName && <span className="field-error">{errors.firstName}</span>}
              </div>

              <div className="field">
                <label htmlFor="pf-last">Фамилия</label>
                <input
                  id="pf-last"
                  className={`input ${errors.lastName ? 'input--error' : ''}`}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  disabled={busy}
                />
                {errors.lastName && <span className="field-error">{errors.lastName}</span>}
              </div>

              <div className="field">
                <label htmlFor="pf-phone">Телефон</label>
                <input
                  id="pf-phone"
                  className={`input ${errors.phone ? 'input--error' : ''}`}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+7 900 000-00-00"
                  disabled={busy}
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </div>

              <div className="field">
                <label htmlFor="pf-email">E-mail</label>
                <input id="pf-email" className="input" value={user.email} readOnly disabled />
                <span className="hint">E-mail используется для входа и не меняется.</span>
              </div>

              <button type="submit" className="btn btn--accent" disabled={busy}>
                {busy ? 'Сохраняем…' : 'Сохранить изменения'}
              </button>
            </form>
          ) : (
            <form className="col" onSubmit={changePassword} noValidate>
              <div className="field">
                <label htmlFor="pf-pass">Новый пароль</label>
                <input
                  id="pf-pass"
                  className={`input ${errors.password ? 'input--error' : ''}`}
                  type="password"
                  value={passwords.password}
                  onChange={(e) => setPasswords({ ...passwords, password: e.target.value })}
                  autoComplete="new-password"
                  disabled={busy}
                />
                {errors.password && <span className="field-error">{errors.password}</span>}
                <span className="hint">Минимум 6 символов. Хранится как bcrypt-хэш.</span>
              </div>

              <div className="field">
                <label htmlFor="pf-pass2">Повторите пароль</label>
                <input
                  id="pf-pass2"
                  className={`input ${errors.confirm ? 'input--error' : ''}`}
                  type="password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  autoComplete="new-password"
                  disabled={busy}
                />
                {errors.confirm && <span className="field-error">{errors.confirm}</span>}
              </div>

              <button type="submit" className="btn btn--accent" disabled={busy}>
                {busy ? 'Меняем…' : 'Изменить пароль'}
              </button>
            </form>
          )}
        </section>

        <section className="card">
          <h2 className="card-title">Мои отзывы</h2>

          {loading ? (
            <Loader label="Загружаем отзывы…" />
          ) : reviews.length === 0 ? (
            <EmptyState
              title="Отзывов пока нет"
              description="Оставить отзыв можно на товары из доставленных заказов."
              action={
                <Link to="/orders" className="btn btn--ghost">
                  К моим заказам
                </Link>
              }
            />
          ) : (
            <ul className="my-reviews">
              {reviews.map((review) => (
                <li key={review.id}>
                  <div className="my-reviews__head">
                    <Link to={`/product/${review.product.slug ?? review.product.id}`}>
                      {review.product.name}
                    </Link>
                    <button
                      type="button"
                      className="my-reviews__remove"
                      onClick={() => removeReview(review.id)}
                      aria-label="Удалить отзыв"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="row">
                    <Rating value={review.rating} readOnly size={15} />
                    <span className="muted small">{formatDate(review.createdAt)}</span>
                  </div>
                  {review.title && <strong className="my-reviews__title">{review.title}</strong>}
                  {review.body && <p className="muted small">{review.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
