import { Link } from 'react-router-dom';
import './Footer.css';

const COLUMNS = [
  {
    title: 'Покупателям',
    links: [
      { to: '/catalog', label: 'Каталог' },
      { to: '/catalog?sort=newest', label: 'Новинки' },
      { to: '/orders', label: 'Мои заказы' },
      { to: '/favorites', label: 'Избранное' },
    ],
  },
  {
    title: 'Помощь',
    links: [
      { to: '/catalog?category=1', label: 'Как выбрать размер' },
      { to: '/checkout', label: 'Доставка и оплата' },
      { to: '/profile', label: 'Личный кабинет' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <div className="footer__logo">
            RESELL<span />
          </div>
          <p className="footer__about">
            Магазин одежды, обуви и аксессуаров от проверенных поставщиков из Китая. Прямые
            закупки, контроль качества на складе в Гуанчжоу, доставка по России от 2 дней.
          </p>
          <div className="footer__contacts">
            <span>Челябинск, ул. Кирова, 159</span>
            <a href="tel:+73512000000">+7 (351) 200-00-00</a>
            <a href="mailto:hello@resell.ru">hello@resell.ru</a>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className="footer__col">
            <h4>{col.title}</h4>
            <ul>
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="footer__col">
          <h4>Оплата и доставка</h4>
          <ul className="footer__plain">
            <li>СДЭК — пункт выдачи, 2–4 дня</li>
            <li>Курьер — 1–3 дня, бесплатно от 5 000 ₽</li>
            <li>Почта России — 5–10 дней</li>
            <li>Оплата картой или при получении</li>
          </ul>
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container row row--between">
          <span>© {new Date().getFullYear()} RESELL. Курсовой проект интернет-магазина.</span>
          <Link to="/admin">Админ-панель</Link>
        </div>
      </div>
    </footer>
  );
}
