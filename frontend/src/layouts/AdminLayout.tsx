import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { Loader } from '../components/Loader';
import { Toasts } from '../components/Toasts';
import './AdminLayout.css';

const MENU = [
  { to: '/admin', label: 'Обзор', end: true, icon: '◧' },
  { to: '/admin/products', label: 'Товары', icon: '▤' },
  { to: '/admin/orders', label: 'Заказы', icon: '⬡' },
  { to: '/admin/users', label: 'Пользователи', icon: '◍' },
  { to: '/admin/analytics', label: 'Аналитика', icon: '◭' },
  { to: '/admin/promocodes', label: 'Промокоды', icon: '✦' },
  { to: '/admin/expenses', label: 'Расходы', icon: '₽' },
];

/** Обёртка админ-панели: боковое меню + защита по роли ADMIN. */
export function AdminLayout() {
  const navigate = useNavigate();
  const { user, initialized, bootstrap } = useAuthStore();

  useEffect(() => {
    if (!initialized) void bootstrap();
  }, [initialized, bootstrap]);

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      navigate('/login?next=/admin', { replace: true });
      return;
    }
    if (user.role !== 'ADMIN') navigate('/', { replace: true });
  }, [initialized, user, navigate]);

  if (!initialized || !user || user.role !== 'ADMIN') {
    return <Loader label="Проверка прав администратора…" />;
  }

  return (
    <div className="admin">
      <aside className="admin__aside">
        <Link to="/" className="admin__logo">
          RESELL<span />
        </Link>
        <div className="admin__section">Админ-панель</div>

        <nav className="admin__nav">
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin__link ${isActive ? 'is-active' : ''}`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin__aside-foot">
          <Link to="/" className="admin__link">
            <span aria-hidden>←</span> К магазину
          </Link>
          <div className="admin__user">
            <span className="admin__avatar">{user.firstName.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.firstName}</strong>
              <span className="admin__role">ADMIN</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin__main">
        <header className="admin__topbar">
          <div className="admin__crumb">
            <Link to="/">Магазин</Link> <span aria-hidden>/</span> Администрирование
          </div>
          <div className="row">
            <span className="badge badge--ok">PostgreSQL · Prisma</span>
            <Link to="/profile" className="btn btn--ghost btn--sm">
              Профиль
            </Link>
          </div>
        </header>

        <div className="admin__content">
          <Outlet />
        </div>
      </div>

      <Toasts />
    </div>
  );
}
