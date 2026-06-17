// components/modules/interventi/StoricoTabella.tsx
'use client';

import type { RigaStorico } from '@/lib/interventi/storico/types';

const COLS: { key: keyof RigaStorico | 'origineLabel'; header: string }[] = [
  { key: 'data', header: 'Data' },
  { key: 'origineLabel', header: 'Origine' },
  { key: 'committente', header: 'Committente' },
  { key: 'odl', header: 'ODL' },
  { key: 'pdr', header: 'PDR' },
  { key: 'matricola', header: 'Matricola' },
  { key: 'nominativo', header: 'Nominativo' },
  { key: 'indirizzo', header: 'Indirizzo' },
  { key: 'comune', header: 'Comune' },
  { key: 'cap', header: 'CAP' },
  { key: 'attivita', header: 'Attività' },
  { key: 'fascia_oraria', header: 'Fascia oraria' },
  { key: 'esecutoreNome', header: 'Esecutore' },
  { key: 'statoLabel', header: 'Stato' },
  { key: 'esitoLabel', header: 'Esito' },
  { key: 'motivo', header: 'Motivo' },
];

function cella(r: RigaStorico, key: (typeof COLS)[number]['key']): string {
  if (key === 'origineLabel') return r.origine === 'manuale' ? 'Manuale' : 'Programmato';
  const v = r[key as keyof RigaStorico];
  return v == null || v === '' ? '—' : String(v);
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
            {COLS.map((c) => (<th key={c.header} className="whitespace-nowrap px-3 py-2 font-medium">{c.header}</th>))}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => (
            <tr key={r.id} className="border-t border-[var(--brand-border)] hover:bg-[var(--brand-surface-muted)]">
              {COLS.map((c) => (
                <td key={c.header} className="whitespace-nowrap px-3 py-2 text-[var(--brand-text-main)]">{cella(r, c.key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
