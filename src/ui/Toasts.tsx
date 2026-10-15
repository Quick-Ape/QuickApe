import { IconAlert, IconCheck, IconExternal, IconX } from './icons';
import { dismissToast, useOverlay } from './store';

export function Toasts({ inline = false }: { inline?: boolean }) {
  const toasts = useOverlay((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className={inline ? 'qa-toasts inline' : 'qa-toasts'}>
      {toasts.map((t) => (
        <div key={t.id} className={`qa-toast qa-glass ${t.kind}`}>
          <span className="qa-toast-ic">
            {t.kind === 'pending' ? (
              <span className="qa-spin" />
            ) : t.kind === 'success' ? (
              <IconCheck size={15} />
            ) : (
              <IconAlert size={15} />
            )}
          </span>
          <div className="qa-toast-body">
            <b>{t.title}</b>
            {t.body && <span>{t.body}</span>}
            {t.link && (
              <a href={t.link} target="_blank" rel="noreferrer">
                View transaction <IconExternal size={12} />
              </a>
            )}
          </div>
          <button className="qa-icon" aria-label="Close" onClick={() => dismissToast(t.id)}>
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
