import { useToastStore } from '../store/toast.store';

/** Всплывающие уведомления: успех, ошибка, информация. */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => dismiss(t.id)}>
          <span aria-hidden>{t.kind === 'error' ? '✕' : t.kind === 'info' ? 'ℹ' : '✓'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
