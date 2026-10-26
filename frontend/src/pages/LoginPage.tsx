import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { fieldErrors } from '../services/api';
import { ApiRequestError } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import './Auth.css';

const DEMO = [
  { role: 'Покупатель', email: 'demo@resell.ru', password: 'demo1234' },
  { role: 'Администратор', email: 'admin@resell.ru', password: 'admin123' },
];

/** Вход в аккаунт. После входа возвращаемся на страницу из ?next= */
export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const next = params.get('next') || (user?.role === 'ADMIN' ? '/admin' : '/profile');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = 'Укажите e-mail';
    if (!password) nextErrors.password = 'Укажите пароль';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    setFormError(null);
    try {
      const logged = await login(email.trim(), password);
      await useCartStore.getState().fetch();
      await useFavoriteStore.getState().fetch();
      toast.success(`С возвращением, ${logged.firstName}!`);
      navigate(logged.role === 'ADMIN' && next === '/profile' ? '/admin' : next, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(fieldErrors(err.details));
        setFormError(err.message);
      } else {
        setFormError('Сервер недоступен. Попробуйте позже.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function quickLogin(demo: { email: string; password: string }) {
    setEmail(demo.email);
    setPassword(demo.password);
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      const logged = await login(demo.email, demo.password);
      await useCartStore.getState().fetch();
      await useFavoriteStore.getState().fetch();
      toast.success(`Вход выполнен: ${logged.email}`);
      navigate(logged.role === 'ADMIN' ? '/admin' : '/catalog', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не удалось войти');
      setBusy(false);
    }
  }

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="container auth">
      <div className="auth__card card">
        <h1>Вход в аккаунт</h1>
        <p className="muted">
          Войдите, чтобы оформлять заказы, отслеживать их статус и хранить избранное.
        </p>

        {formError && (
          <p className="alert alert--error" role="alert">
            {formError}
          </p>
        )}

        <form className="col" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              className={`input ${errors.email ? 'input--error' : ''}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={busy}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="login-password">Пароль</label>
            <div className="password">
              <input
                id="login-password"
                className={`input ${errors.password ? 'input--error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={busy}
              />
              <button
                type="button"
                className="password__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? '⊘' : '◉'}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn--accent btn--block btn--lg" disabled={busy}>
            {busy ? 'Проверяем…' : 'Войти'}
          </button>
        </form>

        <p className="muted small center-note">
          Нет аккаунта? <Link to={`/register?next=${encodeURIComponent(next)}`}>Зарегистрируйтесь</Link>
        </p>
      </div>

      <aside className="auth__side card">
        <h2>Демо-доступ</h2>
        <p className="muted small">
          Учебный проект с заполненной базой данных. Войдите под любой ролью одним нажатием —
          данные подставятся автоматически.
        </p>

        <div className="col">
          {DEMO.map((demo) => (
            <button
              key={demo.email}
              type="button"
              className={`demo ${demo.role === 'Администратор' ? 'demo--admin' : ''}`}
              onClick={() => quickLogin(demo)}
              disabled={busy}
            >
              <span className="demo__role">{demo.role}</span>
              <span className="demo__email">{demo.email}</span>
              <span className="demo__pass">{demo.password}</span>
            </button>
          ))}
        </div>

        <div className="alert alert--info">
          <strong>Администратор</strong> видит закупочные цены, себестоимость, прибыль и
          маржинальность. Покупателю эти данные API не отдаёт.
        </div>
      </aside>
    </div>
  );
}
