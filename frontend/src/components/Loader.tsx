/** Индикатор загрузки. */
export function Loader({ label }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <div className="spinner" />
        {label && <span className="muted small">{label}</span>}
      </div>
    </div>
  );
}

/** Заглушка при пустом результате. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {description && <p className="small">{description}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/** Плитки-скелетоны для каталога, пока идёт загрузка. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid-products">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="skeleton" style={{ aspectRatio: '4 / 5', borderRadius: 0 }} />
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="skeleton" style={{ height: 10, width: '40%' }} />
            <div className="skeleton" style={{ height: 14, width: '85%' }} />
            <div className="skeleton" style={{ height: 18, width: '35%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
