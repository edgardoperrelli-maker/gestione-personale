// components/modules/interventi/StoricoTabella.tsx
'use client';

import type { RigaStorico } from '@/lib/interventi/storico/types';

const COLS: { key: keyof RigaStorico; header: string; siNo?: boolean }[] = [
  { key: 'odl', header: 'ODL/ODS' },
  { key: 'data', header: 'Data esecuzione' },
  { key: 'esecutore', header: 'Esecutore' },
  { key: 'via', header: 'Via' },
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
  const v = r[key];
  return v == null || v === '' ? '—' : String(v);
}

function toneClass(v: string): string {
  if (v === 'SI') return 'font-semibold text-[var(--success)]';
  if (v === 'NO') return 'font-semibold text-[var(--danger)]';
  return 'text-[var(--brand-text-muted)]';
}

export default function StoricoTabella({ righe }: { righe: RigaStorico[] }) {
  if (righe.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] py-12 text-center text-sm text-[var(--brand-text-muted)]">
        Nessun intervento trovato.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--brand-border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--brand-surface-muted)] text-xs uppercase tracking-wide text-[var(--brand-text-muted)]">
          <tr>
            {COLS.map((c) => (
              <th key={c.header} className="whitespace-nowrap px-3 py-2 font-medium">{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="border-t border-[var(--brand-border)] hover:bg-[var(--brand-surface-muted)]">
              {COLS.map((c) => {
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
