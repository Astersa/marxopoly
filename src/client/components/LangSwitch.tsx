import { LANGS } from '../../shared/i18n';
import { useL } from '../i18n';
import { setLang } from '../store';

export function LangSwitch() {
  const { lang, t } = useL();
  return (
    <div role="group" aria-label={t('lang.switch')} className="inline-flex border-2 border-[color:var(--paper)]">
      {LANGS.map(l => (
        <button key={l} type="button" aria-pressed={lang === l} data-testid={`lang-${l}`} onClick={() => setLang(l)}
          className={`font-poster text-sm tracking-widest px-2.5 py-1 min-h-[34px] ${lang === l ? 'bg-[color:var(--paper)] text-[color:var(--ink)]' : 'text-[color:var(--paper)] hover:bg-[color:var(--coal3)]'}`}>
          {t(`lang.${l}` as const)}
        </button>
      ))}
    </div>
  );
}
