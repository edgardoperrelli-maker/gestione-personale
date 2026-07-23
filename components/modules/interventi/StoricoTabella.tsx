// components/modules/interventi/StoricoTabella.tsx
'use client';

import type { RigaStorico } from '@/lib/interventi/storico/types';
import { attivitaUnificataDisplay } from '@/lib/attivita/attivitaDisplay';

// 'Attività' è la descrizione grezza della voce; 'Gruppo attività' il gruppo di
// tassonomia risolto (stesso valore su cui lavora il filtro omonimo).
export const COLS: { key: keyof RigaStorico; header: string; siNo?: boolean }[] = [
  { key: 'odl', header: 'ODL/ODS' },
  { key: 'pdr', header: 'PDR' },
  { key: 'matricola', header: 'Matricola' },
  { key: 'sigillo', header: 'Sigillo' },
  { key: 'data', header: 'Data esecuzione' },
  { key: 'esecutore', header: 'Esecutore' },
  { key: 'via', header: 'Via' },
  { key: 'gruppoAttivita', header: 'Attività' },
  { key: 'gruppo', header: 'Gruppo attività' },
  { key: 'committente', header: 'Committente' },
  { key: 'territorio', header: 'Territorio' },
  { key: 'eseguito', header: 'Eseguito', siNo: true },
  { key: 'sostValvola', header: 'Sost. valvola', siNo: true },
  { key: 'miniBag', header: 'Mini bag', siNo: true },
  { key: 'rgStop', header: 'RG stop', siNo: true },
  { key: 'note', header: 'Note' },
];

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function cella(r: RigaStorico, key: keyof RigaStorico): string {
  if (key === 'data') return fmtData(r.data);
  if (key === 'committente') return r.committente ? r.committente.toUpperCase() : '—';
  // Colonna "Attività": codice unificato a display (lo storage/export conserva il dettaglio).
  if (key === 'gruppoAttivita') return attivitaUnificataDisplay(r.gruppoAttivita) || '—';
  const v = r[key];
  return v == null || v === '' ? '—' : String(v);
}

function toneClass(v: string): string {
  if (v === 'SI') return 'font-semibold text-[var(--status-ok)]';
  if (v === 'NO') return 'font-semibold text-[var(--status-ko)]';
  return 'text-[var(--brand-text-muted)]';
}

export default function StoricoTabella({
  righe, isAdminPlus, puoModificare, onFoto, onModifica, onCancella, onRiga, rigaSelezionata, colonneVisibili,
}: {
  righe: RigaStorico[];
  isAdminPlus: boolean;
  puoModificare: boolean;
  onFoto: (voceId: string) => void;
  onModifica: (voceId: string) => void;
  onCancella: (voceId: string) => void;
  /** Click sulla riga → apre il drawer di dettaglio (sistema Cockpit). */
  onRiga?: (r: RigaStorico) => void;
  rigaSelezionata?: string | null;
  /** Chiavi delle colonne visibili (selettore colonne); vuoto/assente = tutte. */
  colonneVisibili?: string[];
}) {
  const cols = colonneVisibili && colonneVisibili.length > 0
    ? COLS.filter((c) => colonneVisibili.includes(c.key))
    : COLS;
  if (righe.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun intervento trovato.
      </div>
    );
  }
  return (
    <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b border-[var(--brand-border-strong)] text-xs text-[var(--brand-text-muted)]">
          <tr>
            {cols.map((c) => (
              <th key={c.header} className="whitespace-nowrap bg-[var(--brand-surface-muted)] px-3 py-2 font-semibold">{c.header}</th>
            ))}
            <th className="whitespace-nowrap bg-[var(--brand-surface-muted)] px-3 py-2 text-right font-semibold">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr
              key={r.id}
              onClick={onRiga ? () => onRiga(r) : undefined}
              className={`border-t border-[var(--brand-border)] ${
                rigaSelezionata === r.id
                  ? 'bg-[var(--brand-primary-soft)] shadow-[inset_3px_0_0_var(--brand-primary)]'
                  : 'hover:bg-[var(--brand-surface-muted)]'
              } ${onRiga ? 'cursor-pointer' : ''}`}
            >
              {cols.map((c) => {
                const testo = cella(r, c.key);
                return (
                  <td
                    key={c.header}
                    className={`whitespace-nowrap px-3 py-2 ${c.siNo ? toneClass(testo) : 'text-[var(--brand-text-main)]'}`}
                  >
                    {testo}
                  </td>
                );
              })}
              {/* stopPropagation: i bottoni riga non devono aprire/chiudere il drawer */}
              <td className="whitespace-nowrap px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onFoto(r.id)}
                    title="Vedi foto"
                    aria-label="Vedi foto"
                    className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                  >
                    📷
                  </button>
                  {puoModificare && (
                    <button
                      type="button"
                      onClick={() => onModifica(r.id)}
                      title="Modifica"
                      aria-label="Modifica"
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                    >
                      ✎
                    </button>
                  )}
                  {isAdminPlus && (
                    <button
                      type="button"
                      onClick={() => onCancella(r.id)}
                      title="Elimina riga"
                      aria-label="Elimina riga"
                      className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-[var(--brand-text-main)] transition hover:border-[var(--danger)] hover:text-[var(--danger)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
    </table>
  );
}
