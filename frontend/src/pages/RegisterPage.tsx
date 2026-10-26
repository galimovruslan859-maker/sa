import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiRequestError, fieldErrors } from '../services/api';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import './Auth.css';

const PERKS = [
  'Оформление заказа в пару шагов и отслеживание статуса',
  'Избранные товары сохраняются между устройствами',
  'Отзывы и оценки на купленные позиции',
  'Промокоды и бесплатная доставка от 5 000 ₽',
];

/** Регистрация нового покупателя. */
export default function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const register = useAuthStore((s) => s.register);
  const user = useAuthStore((s) => s.user);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [agree, setAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const next = params.get('next') || '/catalog';

  const set = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '', confirm: '' }));
    setFormError(null);
  };

  const passwordStrength = (() => {
    const value = form.password;
    if (!value) return { score: 0, label: '' };
    let score = 0;
    if (value.length >= 6) score += 1;
    if (value.length >= 10) score += 1;
    if (/[A-ZА-Я]/.test(value) && /[a-zа-я]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^A-Za-zА-Яа-я0-9]/.test(value)) score += 1;
    const labels = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Надёжный', 'Отличный'];
    return { score, label: labels[score] };
  })();

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (form.firstName.trim().length < 2) nextErrors.firstName = 'Минимум 2 символа';
    if (form.lastName.trim() && form.lastName.trim().length < 2)
      nextErrors.lastName = 'Минимум 2 символа';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) nextErrors.email = 'Некорректный e-mail';
    if (form.phone.trim() && form.phone.trim().length < 6) nextErrors.phone = 'Слишком короткий номер';
    if (form.password.length < 6) nextErrors.password = 'Пароль: минимум 6 символов';
    if (form.confirm !== form.password) nextErrors.confirm = 'Пароли не совпадают';
    if (!agree) nextErrors.agree = 'Нужно согласие на обработку данных';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !validate()) return;

    setBusy(true);
    setFormError(null);
    try {
      const created = await register({
        email: form.email.trim(),
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
      });
      useCartStore.getState().reset();
      useFavoriteStore.getState().reset();
      await useCartStore.getState().fetch();
      await useFavoriteStore.getState().fetch();
      toast.success(`Аккаунт создан. Добро пожаловать, ${created.firstName}!`);
      navigate(next, { replace: true });
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

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="container auth">
      <div className="auth__card card">
        <h1>Регистрация</h1>
        <p className="muted">Создайте аккаунт покупателя — это займёт меньше минуты.</p>

        {formError && (
          <p className="alert alert--error" role="alert">
            {formError}
          </p>
        )}

        <form className="col" onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="reg-first">Имя *</label>
              <input
                id="reg-first"
                className={`input ${errors.firstName ? 'input--error' : ''}`}
                value={form.firstName}
                onChange={(e) => set('firstName', e.target.value)}
                placeholder="Иван"
                autoComplete="given-name"
                disabled={busy}
              />
              {errors.firstName && <span className="field-error">{errors.firstName}</span>}
            </div>

            <div className="field">
              <label htmlFor="reg-last">Фамилия</label>
              <input
                id="reg-last"
                className={`input ${errors.lastName ? 'input--error' : ''}`}
                value={form.lastName}
                onChange={(e) => set('lastName', e.target.value)}
                placeholder="Петров"
                autoComplete="family-name"
                disabled={busy}
              />
              {errors.lastName && <span className="field-error">{errors.lastName}</span>}
            </div>

            <div className="field">
              <label htmlFor="reg-email">E-mail *</label>
              <input
                id="reg-email"
                className={`input ${errors.email ? 'input--error' : ''}`}
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={busy}
              />
              {errors.email && <span className="field-error">{errors.email}</span>}
            </div>

            <div className="field">
              <label htmlFor="reg-phone">Телефон</label>
              <input
                id="reg-phone"
                className={`input ${errors.phone ? 'input--error' : ''}`}
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+7 900 000-00-00"
                autoComplete="tel"
                disabled={busy}
              />
              {errors.phone && <span className="field-error">{errors.phone}</span>}
            </div>

            <div className="field span-2">
              <label htmlFor="reg-password">Пароль *</label>
              <div className="password">
                <input
                  id="reg-password"
                  className={`input ${errors.password ? 'input--error' : ''}`}
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Минимум 6 символов"
                  autoComplete="new-password"
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
              {form.password && (
                <div className="strength" data-score={passwordStrength.score}>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <em>{passwordStrength.label}</em>
                </div>
              )}
              {errors.password && <span className="field-error">{errors.password}</span>}
              <span className="hint">Пароль хранится в базе только в виде bcrypt-хэша.</span>
            </div>

            <div className="field span-2">
              <label htmlFor="reg-confirm">Повторите пароль *</label>
              <input
                id="reg-confirm"
                className={`input ${errors.confirm ? 'input--error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                placeholder="Ещё раз"
                autoComplete="new-password"
                disabled={busy}
              />
              {errors.confirm && <span className="field-error">{errors.confirm}</span>}
            </div>
          </div>

          <label className="checkbox checkbox--agree">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => {
                setAgree(e.target.checked);
                setErrors((prev) => ({ ...prev, agree: '' }));
              }}
              disabled={busy}
            />
            <span>
              Согласен с обработкой персональных данных и условиями сервиса *
              {errors.agree && <em className="field-error">{errors.agree}</em>}
            </span>
          </label>

          <button type="submit" className="btn btn--accent btn--block btn--lg" disabled={busy}>
            {busy ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="muted small center-note">
          Уже есть аккаунт? <Link to={`/login?next=${encodeURIComponent(next)}`}>Войти</Link>
        </p>
      </div>

      <aside className="auth__side card">
        <h2>Что даёт аккаунт</h2>
        <ul className="perks">
          {PERKS.map((perk) => (
            <li key={perk}>
              <span aria-hidden>✓</span>
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <div className="alert alert--info" style={{ marginTop: 20 }}>
          Хотите посмотреть админ-панель с себестоимостью и прибылью?{' '}
          <Link to="/login?next=/admin">Войдите как администратор</Link> — demo-доступ есть на
          странице входа.
        </div>
      </aside>
    </div>
  );
}
