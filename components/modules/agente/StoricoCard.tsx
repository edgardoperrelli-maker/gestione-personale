/* Hallmark · redesign: Cockpit-aligned · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Download, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/Card';
import Badge from '@/components/Badge';
import { badgeModalita, formattaIstante, type AgenteRunRow } from '@/lib/agente/uiTypes';
import { righeModificate } from '@/lib/agente/storicoExport';

function Conteggio({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
      <strong className="font-mono tabular-nums" style={{ color: 'var(--brand-text-main)' }}>{value}</strong> {label}
    </span>
  );
}

export function StoricoCard({ runs }: { runs: AgenteRunRow[] }) {
  const [aperto, setAperto] = useState<string | null>(null);
  // `dettaglio` non arriva più nella lista (troppo pesante): lo carichiamo qui
  // alla prima espansione di ogni giro. `undefined` = non ancora richiesto,
  // 'loading' = fetch in corso.
  const [dettagli, setDettagli] = useState<Record<string, unknown | 'loading'>>({});

  const apri = useCallback(async (run: AgenteRunRow) => {
    if (aperto === run.id) {
      setAperto(null);
      return;
    }
    setAperto(run.id);
    // Già presente (giro appena eseguito con dettaglio inline) o già caricato: niente fetch.
    if (run.dettaglio !== undefined || run.id in dettagli) return;
    setDettagli((d) => ({ ...d, [run.id]: 'loading' }));
    try {
      const res = await fetch(`/api/admin/agente/run/${run.id}`, { cache: 'no-store' });
      const j = res.ok ? await res.json() : { dettaglio: null };
      setDettagli((d) => ({ ...d, [run.id]: j.dettaglio ?? null }));
    } catch {
      setDettagli((d) => ({ ...d, [run.id]: null }));
    }
  }, [aperto, dettagli]);

  return (
    <Card animated={false}>
      <CardContent className="space-y-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Storico giri</h2>
        {runs.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessun giro registrato.</p>
        )}
        <ul className="divide-y divide-[var(--brand-border)]">
          {runs.map((run) => {
            const badge = badgeModalita(run.dry_run);
            const open = aperto === run.id;
            const fonte = run.dettaglio !== undefined ? run.dettaglio : dettagli[run.id];
            const inCaricamento = open && fonte === 'loading';
            const righe = open && fonte !== 'loading' ? righeModificate(fonte) : [];
            const avvisiGrezzi = open && fonte !== 'loading' && fonte && typeof fonte === 'object'
              ? (fonte as { avvisiSync?: unknown }).avvisiSync
              : undefined;
            const avvisiSync = Array.isArray(avvisiGrezzi)
              ? avvisiGrezzi.filter((a): a is string => typeof a === 'string')
              : [];
            return (
              <li key={run.id} className="py-3">
                <button
                  type="button"
                  onClick={() => void apri(run)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  aria-expanded={open}
                >
                  <span className="flex items-center gap-2">
                    {open
                      ? <ChevronDown size={15} className="shrink-0" style={{ color: 'var(--brand-text-subtle)' }} aria-hidden />
                      : <ChevronRight size={15} className="shrink-0" style={{ color: 'var(--brand-text-subtle)' }} aria-hidden />}
                    <span className="font-mono text-sm tabular-nums" style={{ color: 'var(--brand-text-main)' }}>
                      {formattaIstante(run.creato_il)}
                    </span>
                    <Badge variant={badge.tono === 'prova' ? 'warn' : 'primary'}>{badge.label}</Badge>
                    {run.tipo === 'acea-stato' && <Badge variant="primary">Stato ACEA</Badge>}
                    {run.errore && <Badge variant="danger">Errore</Badge>}
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
                  <div className="mt-2 rounded-[var(--radius-lg)] border p-3 text-xs"
                    style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface-muted)' }}>
                    {run.errore && (
                      <p className="mb-2 font-medium" style={{ color: 'var(--danger)' }}>{run.errore}</p>
                    )}
                    {avvisiSync.length > 0 && (
                      <div
                        className="mb-2 space-y-1 rounded-[var(--radius-md)] border px-2 py-1.5"
                        style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)' }}
                      >
                        {avvisiSync.map((a) => (
                          <p key={a} className="flex items-center gap-1.5" style={{ color: 'var(--brand-text-main)' }}>
                            <TriangleAlert size={13} className="shrink-0" style={{ color: 'var(--warning)' }} aria-hidden />
                            {a}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="font-medium" style={{ color: 'var(--brand-text-main)' }}>
                        Righe modificate (<span className="font-mono tabular-nums">{righe.length}</span>)
                      </span>
                      <a
                        href={`/api/admin/agente/run/${run.id}/export`}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-semibold transition hover:bg-[var(--brand-primary-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                        style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--primary-text)' }}
                      >
                        <Download size={13} aria-hidden />
                        Esporta Excel
                      </a>
                    </div>
                    {inCaricamento ? (
                      <p style={{ color: 'var(--brand-text-muted)' }}>Caricamento dettaglio…</p>
                    ) : righe.length === 0 ? (
                      <p style={{ color: 'var(--brand-text-muted)' }}>Nessuna riga modificata in questo giro.</p>
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: '20rem' }}>
                        <table className="w-full border-collapse text-left">
                          <thead className="sticky top-0" style={{ backgroundColor: 'var(--brand-surface-muted)' }}>
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
                                <td className="px-2 py-1 font-mono tabular-nums">{r.riga}</td>
                                <td className="px-2 py-1 font-mono tabular-nums">{r.odl}</td>
                                <td className="px-2 py-1">{r.tipo}</td>
                                <td className="px-2 py-1">{r.comune}</td>
                                <td className="px-2 py-1 font-mono tabular-nums">{r.matricola}</td>
                                <td className="px-2 py-1">{r.esecutore}</td>
                                <td className="px-2 py-1">{r.esito}</td>
                                <td className="px-2 py-1">{r.sigillo}</td>
                                <td className="px-2 py-1 font-mono tabular-nums">{r.data}</td>
                                <td className="px-2 py-1">{r.note}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {righe.length > 200 && (
                          <p className="mt-1" style={{ color: 'var(--brand-text-muted)' }}>
                            …e altre {righe.length - 200}. Scaricale tutte con &ldquo;Esporta Excel&rdquo;.
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
      </CardContent>
    </Card>
  );
}
