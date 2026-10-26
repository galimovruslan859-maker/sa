import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { categoryApi, productApi } from '../services/endpoints';
import type { Category, Product } from '../services/types';
import { ProductCard } from '../components/ProductCard';
import { ProductGridSkeleton } from '../components/Loader';
import { useQuickAdd } from '../lib/useQuickAdd';
import './HomePage.css';

export default function HomePage() {
  const [newest, setNewest] = useState<Product[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const quickAdd = useQuickAdd();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fresh, hot, cats] = await Promise.all([
          productApi.newest(8),
          productApi.list({ sort: 'popular', limit: 4 }),
          categoryApi.list(),
        ]);
        if (!alive) return;
        setNewest(fresh.items);
        setPopular(hot.items);
        setCategories(cats.items.filter((c) => c.productsCount > 0));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="home">
      {/* ------------------------------- Hero ------------------------------- */}
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__text">
            <span className="hero__eyebrow">Прямые поставки из Китая</span>
            <h1>
              Одежда, которую
              <br />
              хочется носить
            </h1>
            <p>
              Мы сами выбираем фабрики в Гуанчжоу и Иу, проверяем каждую партию на складе и
              привозим вещи по честной цене — без наценки за бренд и посредников в России.
            </p>
            <div className="hero__actions">
              <Link to="/catalog" className="btn btn--lg">
                Перейти в каталог
              </Link>
              <Link to="/catalog?sort=newest" className="btn btn--ghost btn--lg">
                Смотреть новинки
              </Link>
            </div>
            <dl className="hero__facts">
              <div>
                <dt>Доставка</dt>
                <dd>от 2 дней</dd>
              </div>
              <div>
                <dt>Возврат</dt>
                <dd>14 дней</dd>
              </div>
              <div>
                <dt>Оплата</dt>
                <dd>картой или при получении</dd>
              </div>
            </dl>
          </div>

          <div className="hero__visual" aria-hidden>
            <div className="hero__card hero__card--1" />
            <div className="hero__card hero__card--2" />
            <div className="hero__card hero__card--3" />
            <div className="hero__badge">
              <strong>−10%</strong>
              <span>по промокоду RESELL10</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------- Категории ---------------------------- */}
      <section className="container home__section">
        <div className="page-head">
          <div>
            <h2>Категории</h2>
            <p className="page-subtitle">10 направлений ассортимента — от базовых футболок до пуховиков</p>
          </div>
          <Link to="/catalog" className="btn btn--ghost btn--sm">
            Весь каталог
          </Link>
        </div>

        <div className="categories">
          {categories.map((c) => (
            <Link key={c.id} to={`/catalog?category=${c.id}`} className="category-tile">
              <span className="category-tile__name">{c.name}</span>
              <span className="category-tile__count">{c.productsCount} товаров</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------ Новинки ----------------------------- */}
      <section className="container home__section">
        <div className="page-head">
          <div>
            <h2>Новинки</h2>
            <p className="page-subtitle">Свежие поступления с фабрик — добавлены за последние 90 дней</p>
          </div>
          <Link to="/catalog?sort=newest" className="btn btn--ghost btn--sm">
            Все новинки
          </Link>
        </div>

        {loading ? (
          <ProductGridSkeleton count={4} />
        ) : (
          <div className="grid-products">
            {newest.slice(0, 8).map((p) => (
              <ProductCard key={p.id} product={p} onQuickAdd={quickAdd} />
            ))}
          </div>
        )}
      </section>

      {/* --------------------------- Популярное ----------------------------- */}
      <section className="home__strip">
        <div className="container">
          <div className="page-head">
            <div>
              <h2>Хиты продаж</h2>
              <p className="page-subtitle">Товары с наибольшим количеством заказов</p>
            </div>
            <Link to="/catalog?sort=popular" className="btn btn--ghost btn--sm">
              Смотреть все
            </Link>
          </div>

          {loading ? (
            <ProductGridSkeleton count={4} />
          ) : (
            <div className="grid-products">
              {popular.map((p) => (
                <ProductCard key={p.id} product={p} onQuickAdd={quickAdd} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* --------------------------- Преимущества --------------------------- */}
      <section className="container home__section">
        <div className="advantages">
          <article>
            <span aria-hidden>①</span>
            <h3>Проверенные фабрики</h3>
            <p>
              Работаем напрямую с четырьмя поставщиками в Гуанчжоу, Шэньчжэне и Харбине. Каждую
              партию проверяем на складе перед отправкой.
            </p>
          </article>
          <article>
            <span aria-hidden>②</span>
            <h3>Честная цена</h3>
            <p>
              В цену заложены закупка, доставка из Китая и таможня. Никаких «средних» наценок —
              вы платите за вещь, а не за логотип.
            </p>
          </article>
          <article>
            <span aria-hidden>③</span>
            <h3>Быстрая доставка</h3>
            <p>
              Отправляем со склада в Челябинске в день оплаты. Пункты выдачи СДЭК, курьер и Почта
              России.
            </p>
          </article>
          <article>
            <span aria-hidden>④</span>
            <h3>Обмен и возврат</h3>
            <p>
              14 дней на возврат, если вещь не подошла по размеру. Поможем подобрать размер по
              замерам в карточке товара.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
