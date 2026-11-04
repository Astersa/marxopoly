import { useL } from '../i18n';
import { setGfx, useStore, type Gfx } from '../store';

const OPTIONS: Gfx[] = ['3d-high', '3d-low', '2d'];

export function GfxSwitch() {
  const { t } = useL();
  const gfx = useStore(s => s.gfx);
  const fallback = useStore(s => s.gfxFallback);
  return (
    <div role="group" aria-label={t('gfx.label')} className="inline-flex border-2 border-[color:var(--paper)]" data-testid="gfx-switch">
      {OPTIONS.map(o => (
        <button key={o} type="button" aria-pressed={gfx === o} data-testid={`gfx-${o}`} onClick={() => setGfx(o)}
          className={`font-poster text-xs tracking-wider px-2 py-1 min-h-[34px] whitespace-nowrap ${gfx === o ? (fallback ? 'bg-[color:var(--brass)] text-[color:var(--ink)]' : 'bg-[color:var(--paper)] text-[color:var(--ink)]') : 'text-[color:var(--paper)] hover:bg-[color:var(--coal3)]'}`}>
          {t(`gfx.${o}` as const)}
        </button>
      ))}
    </div>
  );
}
