import { useStore } from '../store';

export function Toasts() {
  const toasts = useStore(s => s.toasts);
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[100] flex flex-col gap-2 items-center px-4 pointer-events-none w-full max-w-md" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} role="status" className={`slide-in pointer-events-auto px-4 py-2 border-2 border-[color:var(--ink)] font-semibold shadow-[4px_4px_0_var(--ink)] ${t.kind === 'error' ? 'bg-[color:var(--red)] text-[color:var(--paper)]' : 'bg-[color:var(--paper)] text-[color:var(--ink)]'}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
