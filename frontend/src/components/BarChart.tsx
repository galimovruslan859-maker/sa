import { useState } from 'react';
import { formatPrice } from '../services/api';
import './BarChart.css';

export interface BarPoint {
  label: string;
  value: number;
  secondary?: number;
  hint?: string;
}

interface Props {
  data: BarPoint[];
  height?: number;
  secondaryLabel?: string;
  primaryLabel?: string;
}

/** Простая столбчатая диаграмма на SVG — без внешних библиотек. */
export function BarChart({ data, height = 180, primaryLabel = 'Выручка', secondaryLabel }: Props) {
  const [active, setActive] = useState<number | null>(null);

  if (data.length === 0) {
    return <p className="muted small">Нет данных за выбранный период.</p>;
  }

  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  const gap = data.length > 40 ? 1 : 3;

  return (
    <div className="chart">
      <div className="chart__legend">
        <span>
          <i className="chart__key chart__key--primary" /> {primaryLabel}
        </span>
        {secondaryLabel && (
          <span>
            <i className="chart__key chart__key--secondary" /> {secondaryLabel}
          </span>
        )}
      </div>

      <div className="chart__plot" style={{ height }}>
        {data.map((point, index) => {
          const h = Math.round((point.value / max) * 100);
          const h2 = point.secondary !== undefined ? Math.round((point.secondary / max) * 100) : null;
          return (
            <div
              key={`${point.label}-${index}`}
              className="chart__col"
              style={{ gap }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              <div className="chart__bars">
                <span className="chart__bar chart__bar--secondary" style={{ height: `${h2 ?? 0}%` }} />
                <span className="chart__bar chart__bar--primary" style={{ height: `${h}%` }} />
              </div>
              {active === index && (
                <div className="chart__tip">
                  <strong>{point.label}</strong>
                  <span>
                    {primaryLabel}: {formatPrice(point.value)}
                  </span>
                  {point.secondary !== undefined && secondaryLabel && (
                    <span>
                      {secondaryLabel}: {formatPrice(point.secondary)}
                    </span>
                  )}
                  {point.hint && <span>{point.hint}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="chart__axis">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

/** Горизонтальные полосы для долей (статусы заказов, категории расходов). */
export function ShareBars({
  items,
  format = (v: number) => String(v),
}: {
  items: Array<{ label: string; value: number; tone?: string }>;
  format?: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="muted small">Нет данных.</p>;

  return (
    <ul className="share">
      {items.map((item) => (
        <li key={item.label}>
          <span className="share__label">{item.label}</span>
          <span className="share__track">
            <span
              className={`share__fill ${item.tone ? `share__fill--${item.tone}` : ''}`}
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </span>
          <span className="share__value">{format(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
