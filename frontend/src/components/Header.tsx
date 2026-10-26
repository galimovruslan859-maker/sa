import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { useFavoriteStore } from '../store/favorite.store';
import { toast } from '../store/toast.store';
import './Header.css';

const NAV = [
  { to: '/catalog', label: 'Каталог' },
  { to: '/catalog?sort=newest', label: 'Новинки' },
  { to: '/catalog?sort=popular', label: 'Популярное' },
];

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const cartCount = useCartStore((s) => s.count);
  const favoritesCount = useFavoriteStore((s) => s.ids.length);

  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const close = () => setNavOpen(false);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, []);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog');
    setNavOpen(false);
  }

  async function handleLogout() {
    await logout();
    useCartStore.getState().reset();
    useFavoriteStore.getState().reset();
    setMenuOpen(false);
    toast.info('Вы вышли из аккаунта');
    navigate('/');
  }

  return (
    <header className="header">
      <div className="header__inner container">
        <button
          className="header__burger"
          type="button"
          aria-label="Меню"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>

        <Link to="/" className="header__logo" onClick={() => setNavOpen(false)}>
          RESELL<span className="header__logo-dot" />
        </Link>

        <nav className={`header__nav ${navOpen ? 'is-open' : ''}`} aria-label="Основная навигация">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="header__nav-link"
              onClick={() => setNavOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <form className="header__search-mobile" onSubmit={submitSearch}>
            <input
              className="input"
              type="search"
              placeholder="Поиск по каталогу"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        </nav>

        <form className="header__search" onSubmit={submitSearch} role="search">
          <input
            type="search"
            placeholder="Поиск: худи, кроссовки, Nike…"
            aria-label="Поиск по каталогу"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" aria-label="Найти">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path
                d="M10.5 3a7.5 7.5 0 0 1 5.9 12.15l4.2 4.2-1.4 1.42-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>

        <div className="header__actions">
          <NavLink to="/favorites" className="header__icon" aria-label="Избранное">
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden>
              <path
                d="M12 20.7 4.6 13.4a4.8 4.8 0 0 1 6.8-6.8l.6.6.6-.6a4.8 4.8 0 1 1 6.8 6.8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </svg>
            {favoritesCount > 0 && <span className="header__counter">{favoritesCount}</span>}
          </NavLink>

          <NavLink to="/cart" className="header__icon" aria-label="Корзина">
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden>
              <path
                d="M6 7h12l1.2 12.2a1 1 0 0 1-1 1.1H5.8a1 1 0 0 1-1-1.1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="M9 7a3 3 0 0 1 6 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
            </svg>
            {cartCount > 0 && <span className="header__counter">{cartCount}</span>}
          </NavLink>

          {user ? (
            <div className="header__user">
              <button
                type="button"
                className="header__icon header__icon--user"
                aria-expanded={menuOpen}
                aria-label="Профиль"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="header__avatar">{user.firstName.slice(0, 1).toUpperCase()}</span>
              </button>

              {menuOpen && (
                <>
                  <div className="header__backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="header__menu" role="menu">
                    <div className="header__menu-head">
                      <strong>{user.firstName}</strong>
                      <span className="muted xs">{user.email}</span>
                    </div>
                    <Link to="/profile" role="menuitem" onClick={() => setMenuOpen(false)}>
                      Профиль
                    </Link>
                    <Link to="/orders" role="menuitem" onClick={() => setMenuOpen(false)}>
                      Мои заказы
                    </Link>
                    <Link to="/favorites" role="menuitem" onClick={() => setMenuOpen(false)}>
                      Избранное
                    </Link>
                    {user.role === 'ADMIN' && (
                      <Link to="/admin" role="menuitem" onClick={() => setMenuOpen(false)}>
                        Админ-панель
                      </Link>
                    )}
                    <button type="button" role="menuitem" onClick={handleLogout}>
                      Выйти
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <NavLink to="/login" className="btn btn--ghost btn--sm header__login">
              Войти
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
