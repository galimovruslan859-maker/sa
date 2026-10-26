import type { OrderStatus } from '../services/types';
import './StatusBadge.css';

export const STATUS_META: Record<OrderStatus, { title: string; tone: string }> = {
  pending: { title: 'Ожидает оплаты', tone: 'warn' },
  paid: { title: 'Оплачен', tone: 'accent' },
  processing: { title: 'Собирается', tone: 'info' },
  shipped: { title: 'Отправлен', tone: 'info' },
  delivered: { title: 'Доставлен', tone: 'ok' },
  cancelled: { title: 'Отменён', tone: 'danger' },
};

/** Порядок статусов — используется для проверки допустимых переходов. */
export const STATUS_FLOW: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
];

/** Бейдж статуса заказа. */
export function StatusBadge({ status, title }: { status: OrderStatus; title?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={`status status--${meta?.tone ?? 'muted'}`}>
      <i aria-hidden />
      {title ?? meta?.title ?? status}
    </span>
  );
}

/** Вертикальный трекер движения заказа. */
export function StatusTrack({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="track track--cancelled">
        <span className="track__dot" />
        <div>
          <strong>Заказ отменён</strong>
          <p className="muted small">Товары возвращены на склад, оплата не списана.</p>
        </div>
      </div>
    );
  }

  const currentIndex = STATUS_FLOW.indexOf(status);

  return (
    <ol className="track">
      {STATUS_FLOW.map((step, index) => {
        const done = index <= currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} className={`${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}>
            <span className="track__dot" aria-hidden />
            <span className="track__label">{STATUS_META[step].title}</span>
          </li>
        );
      })}
    </ol>
  );
}
