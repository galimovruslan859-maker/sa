import { useState } from 'react';

interface Props {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: number;
}

/** Звёздный рейтинг: отображение или выбор оценки. */
export function Rating({ value, onChange, readOnly = false, size = 20 }: Props) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <span className="rating" role={readOnly ? 'img' : 'radiogroup'} aria-label={`Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((star) =>
        readOnly ? (
          <span key={star} aria-hidden style={{ fontSize: size, color: star <= shown ? 'var(--c-accent)' : 'var(--c-line)' }}>
            ★
          </span>
        ) : (
          <button
            key={star}
            type="button"
            className={star <= shown ? 'filled' : ''}
            style={{ fontSize: size }}
            aria-label={`${star} ${star === 1 ? 'звезда' : 'звёзд'}`}
            aria-checked={star === value}
            role="radio"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange?.(star)}
          >
            ★
          </button>
        ),
      )}
    </span>
  );
}
