'use client';

import { useState } from 'react';
import { badgeModalita, formattaIstante, type AgenteRunRow } from '@/lib/agente/uiTypes';
import { righeModificate } from '@/lib/agente/storicoExport';

const cardStyle = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

function Conteggio({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
      <strong style={{ color: 'var(--brand-text-main)' }}>{value}</strong> {label}
    </span>
  );
}

export function StoricoCard({ runs }: { runs: AgenteRunRow[] }) {
  const [aperto, setAperto] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border p-5 space-y-3" style={cardStyle}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Storico giri</h2>
      {runs.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun giro registrato.</p>
      )}
      <ul className="divide-y divide-[var(--brand-border)]">
        {runs.map((run) => {
          const badge = badgeModalita(run.dry_run);
          const open = aperto === run.id;
          const righe = open ? righeModificate(run.dettaglio) : [];
          return (
            <li key={run.id} className="py-3">
              <button
                type="button"
                onClick={() => setAperto(open ? null : run.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                aria-expanded={open}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
                    {formattaIstante(run.creato_il)}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      backgroundColor: badge.tono === 'prova' ? 'var(--warning-soft)' : 'var(--brand-primary-soft)',
                      color: 'var(--brand-text-main)',
                    }}
                  >
                    {badge.label}
                  </span>
                  {run.errore && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}>Errore</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  <Conteggio label="lavori" value={run.lavori} />
                  <Conteggio label="aggiornate" value={run.aggiornate} />
                  <Conteggio label="extra" value={run.extra} />
                  <Conteggio label="conflitti" value={run.conflitti} />
                  <Conteggio label="non collocate" value={run.non_collocate} />
                </span>
              </button>
              {open && (
                <div className="mt-2 rounded-xl border p-3 text-xs"
                  style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface-muted)' }}>
                  {run.errore && (
                    <p className="mb-2 font-medium" style={{ color: 'var(--danger)' }}>{run.errore}</p>
                  )}
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium" style={{ color: 'var(--brand-text-main)' }}>
                      Righe modificate ({righe.length})
                    </span>
                    <a
                      href={`/api/admin/agente/run/${run.id}/export`}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}
                    >
                      ⬇ Esporta Excel
                    </a>
                  </div>
                  {righe.length === 0 ? (
                    <p style={{ color: 'var(--brand-text-muted)' }}>Nessuna riga modificata in questo giro.</p>
                  ) : (
                    <div className="overflow-auto" style={{ maxHeight: '20rem' }}>
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr style={{ color: 'var(--brand-text-muted)' }}>
                            {['File', 'Riga', 'ODL', 'Tipo', 'Comune', 'Matricola', 'Esecutore', 'Esito', 'Sigillo', 'Data', 'Nota'].map((h) => (
                              <th key={h} className="px-2 py-1 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {righe.slice(0, 200).map((r, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                              <td className="px-2 py-1">{r.file}</td>
                              <td className="px-2 py-1">{r.riga}</td>
                              <td className="px-2 py-1">{r.odl}</td>
                              <td className="px-2 py-1">{r.tipo}</td>
                              <td className="px-2 py-1">{r.comune}</td>
                              <td className="px-2 py-1">{r.matricola}</td>
                              <td className="px-2 py-1">{r.esecutore}</td>
                              <td className="px-2 py-1">{r.esito}</td>
                              <td className="px-2 py-1">{r.sigillo}</td>
                              <td className="px-2 py-1">{r.data}</td>
                              <td className="px-2 py-1">{r.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {righe.length > 200 && (
                        <p className="mt-1" style={{ color: 'var(--brand-text-muted)' }}>
                          …e altre {righe.length - 200}. Scaricale tutte con “Esporta Excel”.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
