import type { Pagination } from '../services/types';

interface Props {
  pagination: Pagination;
  onChange: (page: number) => void;
}

/** Пагинация: показывает до 7 номеров страниц вокруг текущей. */
export function PaginationNav({ pagination, onChange }: Props) {
  const { page, pages, total } = pagination;
  if (pages <= 1) {
    return total > 0 ? <p className="muted small center-note">Найдено товаров: {total}</p> : null;
  }

  const window: number[] = [];
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i += 1) window.push(i);

  return (
    <nav className="pagination" aria-label="Страницы">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        ←
      </button>

      {start > 1 && (
        <>
          <button type="button" onClick={() => onChange(1)}>
            1
          </button>
          {start > 2 && <span className="muted">…</span>}
        </>
      )}

      {window.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}

      {end < pages && (
        <>
          {end < pages - 1 && <span className="muted">…</span>}
          <button type="button" onClick={() => onChange(pages)}>
            {pages}
          </button>
        </>
      )}

      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pages}>
        →
      </button>
    </nav>
  );
}
