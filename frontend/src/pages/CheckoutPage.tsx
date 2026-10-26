import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { formatPrice } from '../services/api';
import { orderApi } from '../services/endpoints';
import type { CheckoutPreview, DeliveryMethod } from '../services/types';
import { useAuthStore } from '../store/auth.store';
import { useCartStore } from '../store/cart.store';
import { toast } from '../store/toast.store';
import { EmptyState, Loader } from '../components/Loader';
import './CheckoutPage.css';

interface FormState {
  customerName: string;
  phone: string;
  city: string;
  deliveryMethod: DeliveryMethod;
  address: string;
  pickupPoint: string;
  comment: string;
  promocode: string;
}

const DELIVERY: Array<{
  id: DeliveryMethod;
  name: string;
  days: string;
  note: string;
  icon: string;
}> = [
  { id: 'pickup', name: 'Пункт выдачи', days: '1–2 дня', note: 'Бесплатно', icon: '◍' },
  { id: 'courier', name: 'Курьер', days: '1–3 дня', note: '490 ₽, бесплатно от 5 000 ₽', icon: '⬡' },
  { id: 'post', name: 'Почта России', days: '5–10 дней', note: '350 ₽, бесплатно от 5 000 ₽', icon: '✉' },
];

const PICKUP_POINTS = [
  'Москва, ул. Тверская, 12 — ТЦ «Охотный ряд»',
  'Санкт-Петербург, Невский пр., 88 — ТЦ «Галерея»',
  'Казань, ул. Баумана, 44 — ПВЗ RESELL',
  'Екатеринбург, ул. Вайнера, 15 — ТЦ «Пассаж»',
  'Новосибирск, Красный пр., 101 — ТЦ «Аура»',
];

/** Оформление заказа: контакты → доставка → промокод → подтверждение. */
export default function CheckoutPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { items, count, itemsTotal, loading: cartLoading, fetch: fetchCart, clear: clearCart } = useCartStore();

  const [form, setForm] = useState<FormState>({
    customerName: user ? `${user.firstName} ${user.lastName ?? ''}`.trim() : '',
    phone: user?.phone ?? '',
    city: '',
    deliveryMethod: 'pickup',
    address: '',
    pickupPoint: PICKUP_POINTS[0],
    comment: '',
    promocode: '',
  });
  const [appliedPromo, setAppliedPromo] = useState('');
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isPickup = form.deliveryMethod === 'pickup';

  // корзина нужна для оформления
  useEffect(() => {
    if (user && !useCartStore.getState().loaded) void fetchCart();
  }, [user, fetchCart]);

  // пересчёт итогов при смене доставки или промокода
  const loadPreview = useCallback(async () => {
    if (!user) return;
    setPreviewLoading(true);
    try {
      const data = await orderApi.checkoutPreview(form.deliveryMethod, appliedPromo || undefined);
      setPreview(data);
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof Error ? err.message : 'Не удалось рассчитать заказ');
    } finally {
      setPreviewLoading(false);
    }
  }, [user, form.deliveryMethod, appliedPromo]);

  useEffect(() => {
    if (user && count > 0) void loadPreview();
  }, [user, count, loadPreview]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const total = preview?.total ?? itemsTotal;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (form.customerName.trim().length < 2) next.customerName = 'Укажите имя получателя';
    if (form.phone.trim().length < 6) next.phone = 'Укажите телефон для связи';
    if (form.city.trim().length < 2) next.city = 'Укажите город доставки';
    if (isPickup && !form.pickupPoint.trim()) next.pickupPoint = 'Выберите пункт выдачи';
    if (!isPickup && form.address.trim().length < 5) next.address = 'Укажите адрес доставки';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const applyPromocode = () => {
    const code = form.promocode.trim().toUpperCase();
    if (!code) {
      setAppliedPromo('');
      return;
    }
    setAppliedPromo(code);
    set('promocode', code);
  };

  const submit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const order = await orderApi.create({
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        deliveryMethod: form.deliveryMethod,
        address: isPickup ? '' : form.address.trim(),
        pickupPoint: isPickup ? form.pickupPoint.trim() : '',
        comment: form.comment.trim(),
        promocode: appliedPromo || '',
      });
      await clearCart();
      toast.success(`Заказ ${order.number} оформлен`);
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : 'Не удалось оформить заказ');
    }
  };

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/checkout')}`} replace />;

  if (cartLoading && !useCartStore.getState().loaded) return <Loader label="Загружаем корзину…" />;

  if (count === 0) {
    return (
      <div className="container">
        <div className="page-head">
          <h1>Оформление заказа</h1>
        </div>
        <EmptyState
          title="Корзина пуста"
          description="Добавьте товары из каталога, чтобы оформить заказ."
          action={
            <Link to="/catalog" className="btn btn--accent">
              Перейти в каталог
            </Link>
          }
        />
      </div>
    );
  }

  const summaryItems =
    preview?.items ??
    items.map((i) => ({
      id: i.id,
      name: i.name,
      size: i.size,
      color: i.color,
      image: i.image,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    }));

  return (
    <div className="container">
      <div className="page-head">
        <h1>Оформление заказа</h1>
        <p className="page-subtitle">
          {count} {count === 1 ? 'позиция' : count < 5 ? 'позиции' : 'позиций'} в корзине
        </p>
      </div>

      <div className="checkout">
        <div className="checkout__form col">
          {/* ---------------------------- Контакты ---------------------------- */}
          <section className="card">
            <h2 className="card-title">
              <span className="step">1</span> Контактные данные
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="co-name">Имя и фамилия получателя *</label>
                <input
                  id="co-name"
                  className={`input ${errors.customerName ? 'input--error' : ''}`}
                  value={form.customerName}
                  onChange={(e) => set('customerName', e.target.value)}
                  placeholder="Иван Петров"
                  autoComplete="name"
                />
                {errors.customerName && <span className="field-error">{errors.customerName}</span>}
              </div>

              <div className="field">
                <label htmlFor="co-phone">Телефон *</label>
                <input
                  id="co-phone"
                  className={`input ${errors.phone ? 'input--error' : ''}`}
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+7 900 000-00-00"
                  inputMode="tel"
                  autoComplete="tel"
                />
                {errors.phone && <span className="field-error">{errors.phone}</span>}
              </div>
            </div>
          </section>

          {/* ---------------------------- Доставка ---------------------------- */}
          <section className="card">
            <h2 className="card-title">
              <span className="step">2</span> Способ доставки
            </h2>

            <div className="delivery-list">
              {DELIVERY.map((option) => (
                <label
                  key={option.id}
                  className={`delivery ${form.deliveryMethod === option.id ? 'is-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value={option.id}
                    checked={form.deliveryMethod === option.id}
                    onChange={() => set('deliveryMethod', option.id)}
                  />
                  <span className="delivery__icon" aria-hidden>
                    {option.icon}
                  </span>
                  <span className="delivery__text">
                    <strong>{option.name}</strong>
                    <small>{option.days}</small>
                  </span>
                  <span className="delivery__price">{option.note}</span>
                </label>
              ))}
            </div>

            <div className="form-grid" style={{ marginTop: 18 }}>
              <div className="field">
                <label htmlFor="co-city">Город *</label>
                <input
                  id="co-city"
                  className={`input ${errors.city ? 'input--error' : ''}`}
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder="Москва"
                  autoComplete="address-level2"
                />
                {errors.city && <span className="field-error">{errors.city}</span>}
              </div>

              {isPickup ? (
                <div className="field">
                  <label htmlFor="co-pickup">Пункт выдачи *</label>
                  <select
                    id="co-pickup"
                    className={`input ${errors.pickupPoint ? 'input--error' : ''}`}
                    value={form.pickupPoint}
                    onChange={(e) => set('pickupPoint', e.target.value)}
                  >
                    {PICKUP_POINTS.map((point) => (
                      <option key={point} value={point}>
                        {point}
                      </option>
                    ))}
                  </select>
                  {errors.pickupPoint && <span className="field-error">{errors.pickupPoint}</span>}
                </div>
              ) : (
                <div className="field">
                  <label htmlFor="co-address">Адрес доставки *</label>
                  <input
                    id="co-address"
                    className={`input ${errors.address ? 'input--error' : ''}`}
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder="ул. Ленина, д. 10, кв. 25"
                    autoComplete="street-address"
                  />
                  {errors.address && <span className="field-error">{errors.address}</span>}
                </div>
              )}

              <div className="field span-2">
                <label htmlFor="co-comment">Комментарий к заказу</label>
                <textarea
                  id="co-comment"
                  className="input"
                  rows={3}
                  value={form.comment}
                  onChange={(e) => set('comment', e.target.value)}
                  placeholder="Например: позвонить за час до доставки"
                />
              </div>
            </div>
          </section>

          {/* --------------------------- Оплата ------------------------------- */}
          <section className="card">
            <h2 className="card-title">
              <span className="step">3</span> Оплата
            </h2>
            <div className="pay-row">
              <span className="pay-row__icon" aria-hidden>
                ◧
              </span>
              <div>
                <strong>Оплата при получении</strong>
                <p className="muted small">
                  Заказ переходит в статус «Оплачен» после подтверждения менеджером. Это учебный
                  проект, реальная платёжная система не подключена.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* ----------------------------- Итоги -------------------------------- */}
        <aside className="checkout__aside">
          <div className="card summary">
            <h2 className="card-title">Ваш заказ</h2>

            <ul className="summary__items">
              {summaryItems.map((item) => (
                <li key={item.id}>
                  {item.image ? (
                    <img src={item.image} alt={item.name} loading="lazy" />
                  ) : (
                    <span className="summary__thumb" aria-hidden />
                  )}
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.color} · {item.size} · {item.quantity} шт.
                    </small>
                  </div>
                  <span>{formatPrice(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="promo">
              <input
                className="input"
                value={form.promocode}
                onChange={(e) => set('promocode', e.target.value.toUpperCase())}
                placeholder="Промокод"
                aria-label="Промокод"
              />
              <button type="button" className="btn btn--ghost" onClick={applyPromocode}>
                Применить
              </button>
            </div>

            {preview?.promocodeError && (
              <p className="alert alert--error" style={{ marginTop: 10 }}>
                {preview.promocodeError}
              </p>
            )}
            {appliedPromo && !preview?.promocodeError && (preview?.discount ?? 0) > 0 && (
              <p className="alert alert--ok" style={{ marginTop: 10 }}>
                Промокод <strong>{appliedPromo}</strong> применён: скидка{' '}
                {formatPrice(preview?.discount ?? 0)}
              </p>
            )}

            <dl className="summary__rows" style={{ marginTop: 16 }}>
              <div>
                <dt>Товары</dt>
                <dd>{formatPrice(preview?.itemsTotal ?? itemsTotal)}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>
                  {(preview?.deliveryCost ?? 0) === 0
                    ? 'Бесплатно'
                    : formatPrice(preview?.deliveryCost ?? 0)}
                </dd>
              </div>
              {(preview?.discount ?? 0) > 0 && (
                <div>
                  <dt>Скидка</dt>
                  <dd className="is-discount">−{formatPrice(preview?.discount ?? 0)}</dd>
                </div>
              )}
            </dl>

            <div className="summary__total">
              <span>К оплате</span>
              <strong>{formatPrice(total)}</strong>
            </div>

            {previewLoading && <p className="muted small">Пересчитываем итоги…</p>}

            <button
              type="button"
              className="btn btn--accent btn--block btn--lg"
              onClick={submit}
              disabled={submitting || previewLoading}
            >
              {submitting ? 'Оформляем…' : `Оформить заказ · ${formatPrice(total)}`}
            </button>

            <p className="muted small" style={{ textAlign: 'center', marginTop: 12 }}>
              Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных.
            </p>

            <Link to="/cart" className="btn btn--ghost btn--block" style={{ marginTop: 10 }}>
              Вернуться в корзину
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
