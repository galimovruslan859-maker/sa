import { Link } from 'react-router-dom';
import './NotFoundPage.css';

const SUGGESTIONS = [
  { to: '/catalog', label: 'Каталог товаров', note: '26 позиций в наличии' },
  { to: '/catalog?sort=newest', label: 'Новинки недели', note: 'свежие поступления из Китая' },
  { to: '/orders', label: 'Мои заказы', note: 'история и статусы доставки' },
];

/** Страница 404 — маршрут не найден. */
export default function NotFoundPage() {
  return (
    <div className="container notfound">
      <p className="notfound__code">404</p>
      <h1>Страница не найдена</h1>
      <p className="notfound__text">
        Похоже, такой страницы нет в магазине RESELL. Возможно, ссылка устарела или товар снят с
        продажи.
      </p>

      <div className="row notfound__actions">
        <Link to="/" className="btn btn--accent btn--lg">
          На главную
        </Link>
        <Link to="/catalog" className="btn btn--ghost btn--lg">
          В каталог
        </Link>
      </div>

      <ul className="notfound__links">
        {SUGGESTIONS.map((item) => (
          <li key={item.to}>
            <Link to={item.to}>
              <strong>{item.label}</strong>
              <small>{item.note}</small>
              <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
