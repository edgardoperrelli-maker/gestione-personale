'use client';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import DatePicker from '@/components/ui/DatePicker';
import Tooltip from '@/components/ui/Tooltip';
import { AZIONE_ICONA } from './stili';

/**
 * Menu «altre azioni» delle card del Riepilogo.
 *
 * Nasce per togliere di mezzo la zuppa di icone: la riga operatore mostrava
 * otto comandi a sola icona, tutti quadratini grigi identici, e per sapere cosa
 * facessero bisognava passarci sopra uno a uno. Ora restano a vista i tre del
 * giro quotidiano e tutto il resto entra qui, dove ogni voce ha un nome
 * SCRITTO. È anche ciò che fa stare la riga su una riga sola a 1280px.
 */
export type VoceAzione =
  | { tipo: 'bottone'; label: string; onClick: () => void; disabilitato?: boolean; danger?: boolean }
  | { tipo: 'link'; label: string; href: string; nuovaScheda?: boolean }
  | {
      tipo: 'sposta';
      territori: Array<{ id: string; name: string }>;
      territorioCorrente: string | null;
      onSpostaTerritorio: (territorio: string | null) => void;
      onSpostaData: (dataIso: string) => void;
    };

const VOCE =
  'flex w-full items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs font-medium ' +
  'transition-colors hover:bg-[var(--brand-surface-muted)] focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ' +
  'disabled:pointer-events-none disabled:opacity-50';

export default function MenuAzioni({
  voci, busy, ariaLabel,
}: {
  voci: VoceAzione[];
  busy: boolean;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <Tooltip testo={ariaLabel}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={ariaLabel}
          className={AZIONE_ICONA}
        >
          <MoreHorizontal size={13} aria-hidden />
        </button>
      </Tooltip>

      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className="absolute right-0 top-full z-[60] mt-1 w-60 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-1.5 shadow-[var(--shadow-lg)]"
        >
          {voci.map((v, i) => {
            if (v.tipo === 'bottone') {
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={busy || v.disabilitato}
                  onClick={() => { v.onClick(); setOpen(false); }}
                  className={`${VOCE} ${v.danger ? 'text-[var(--danger)]' : 'text-[var(--brand-text-main)]'}`}
                >
                  {v.label}
                </button>
              );
            }
            if (v.tipo === 'link') {
              return (
                <a
                  key={i}
                  role="menuitem"
                  href={v.href}
                  {...(v.nuovaScheda ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  onClick={() => setOpen(false)}
                  className={`${VOCE} text-[var(--brand-text-main)]`}
                >
                  {v.label}
                </a>
              );
            }
            return (
              <div key={i} className="mt-1 border-t border-[var(--brand-border)] px-2 pb-1 pt-2">
                <div className="mb-1 text-xs font-semibold text-[var(--brand-text-muted)]">Sposta in un altro territorio</div>
                <select
                  defaultValue=""
                  disabled={busy}
                  aria-label="Sposta in un altro territorio"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') return;
                    v.onSpostaTerritorio(val === '__reset__' ? null : val);
                    setOpen(false);
                  }}
                  className="mb-2.5 w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-xs text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border-strong)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
                >
                  <option value="" disabled>Scegli territorio…</option>
                  {v.territorioCorrente && <option value="__reset__">Riporta al piano</option>}
                  {v.territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <div className="mb-1 text-xs font-semibold text-[var(--brand-text-muted)]">Sposta in un altro giorno</div>
                <DatePicker
                  value=""
                  onChange={(iso) => { v.onSpostaData(iso); setOpen(false); }}
                  disabled={busy}
                  ariaLabel="Sposta a giorno"
                  fullWidth
                  triggerClassName="border border-[var(--brand-border)] bg-[var(--brand-surface)]"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
