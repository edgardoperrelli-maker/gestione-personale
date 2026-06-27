'use client';

import Button from '@/components/Button';
import { Card } from '@/components/Card';
import type { GruppoOperatore, StatoOp } from '@/lib/agente/costruisciAnteprima';
import type { AceaEsitoRiga } from './tipi';

// ─── Costanti di stato (identiche al monolite) ───────────────────────────────

export const STATO: Record<StatoOp, { label: string; icon: string; bg: string; fg: string }> = {
  libero:      { label: 'libero',            icon: '✓', bg: 'var(--success-soft)', fg: 'var(--success)' },
  conflitto:   { label: 'già pianificato',   icon: '⚠', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  ambiguo:     { label: 'esecutore ambiguo', icon: '?', bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
  non_risolto: { label: 'non risolto',       icon: '?', bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
};

// ─── Helper puri ─────────────────────────────────────────────────────────────

function iniziali(nome: string): string {
  const t = nome.trim().split(/\s+/);
  if (!t[0]) return '—';
  return (t[0][0] + (t[1]?.[0] ?? '')).toUpperCase();
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
}

/** Righe selezionabili di un operatore = comuni liberi, ESCLUSI gli ODL già OK su ACEA (okIds). */
export function righeLibere(o: GruppoOperatore, okIds?: Set<string>): string[] {
  const ids = o.comuni.filter((c) => c.stato === 'libero').flatMap((c) => c.righe.map((r) => r.id));
  return okIds ? ids.filter((id) => !okIds.has(id)) : ids;
}

const ESITO_OK = (e?: string) => e === 'assegnato' || e === 'gia-assegnato';
const ESITO_ERR = (e?: string) => e === 'fallito' || e === 'non assegnato';

// ─── Props ───────────────────────────────────────────────────────────────────

type AnteprimaPianificazioneProps = {
  gruppi: GruppoOperatore[];
  selezione: Set<string>;
  espansi: Set<string>;
  caricando: boolean;
  onToggleRiga: (id: string) => void;
  onToggleOperatore: (o: GruppoOperatore) => void;
  onToggleEspandi: (key: string) => void;
  onScarta: (o: GruppoOperatore) => void;
  esitoPerOdl?: Map<string, AceaEsitoRiga>;
  okIds?: Set<string>;
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function AnteprimaPianificazione({
  gruppi,
  selezione,
  espansi,
  caricando,
  onToggleRiga,
  onToggleOperatore,
  onToggleEspandi,
  onScarta,
  esitoPerOdl,
  okIds,
}: AnteprimaPianificazioneProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Anteprima pianificazione</h2>
        {caricando && <span className="text-xs" style={{ color: 'var(--brand-text-subtle)' }}>aggiorno…</span>}
      </div>

      {gruppi.map((o) => {
        const st = STATO[o.stato];
        const idsLiberi = righeLibere(o, okIds);
        const selezionabile = idsLiberi.length > 0;
        const selDe = idsLiberi.filter((id) => selezione.has(id)).length;
        const aperto = espansi.has(o.key);
        const nComuni = o.comuni.length;
        // badge errore per-risorsa: join per ODL, SOLO esiti reali (le Prove non colorano)
        const bdg = (() => {
          if (!esitoPerOdl) return null;
          let ok = 0, errore = 0, visti = 0;
          for (const r of o.righe) {
            const e = r.odl ? esitoPerOdl.get(r.odl) : undefined;
            if (!e || e.dry_run) continue;
            visti++;
            if (ESITO_OK(e.esito)) ok++; else if (ESITO_ERR(e.esito)) errore++;
          }
          return visti ? { ok, errore } : null;
        })();
        const inErrore = !!bdg && bdg.errore > 0;
        const okSenzaErrore = !!bdg && bdg.errore === 0 && bdg.ok > 0;
        return (
          <Card key={o.key} className="overflow-hidden" animated={false}
            style={inErrore ? { borderColor: 'var(--danger)', borderLeftWidth: 4, borderLeftColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)' } : undefined}>
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ opacity: o.staffId ? 1 : 0.75 }}>
              <input
                type="checkbox"
                disabled={!selezionabile}
                aria-label={`seleziona ${o.nome}`}
                checked={selezionabile && selDe === idsLiberi.length}
                ref={(el) => { if (el) el.indeterminate = selezionabile && selDe > 0 && selDe < idsLiberi.length; }}
                onChange={() => onToggleOperatore(o)}
              />
              <div
                className="relative flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: st.bg, color: st.fg }}
              >
                {o.staffId ? iniziali(o.nome) : '?'}
                {inErrore && (
                  <span
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                    style={{ backgroundColor: 'var(--danger)', color: '#fff', boxShadow: '0 0 0 2px var(--brand-surface)' }}
                    aria-hidden
                  >
                    {bdg?.errore}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleEspandi(o.key)}
                className="flex flex-1 items-center gap-2 text-left min-w-0 justify-start"
              >
                <span className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text-main)' }}>{o.nome}</span>
                {inErrore && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold flex-none"
                    style={{ backgroundColor: 'var(--danger)', color: '#fff' }}
                    aria-label={`${bdg?.errore} ODL in errore`}
                    title={`${bdg?.errore} ODL in errore — espandi per i dettagli`}
                  >
                    <span aria-hidden>⚠</span>{bdg?.errore}
                  </span>
                )}
                {okSenzaErrore && (
                  <span
                    className="inline-flex h-4 w-4 flex-none items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}
                    title={`Tutti i ${bdg?.ok} ODL assegnati su ACEA`}
                    aria-label={`tutti i ${bdg?.ok} ODL ok`}
                  >
                    ✓
                  </span>
                )}
                <span style={{ color: 'var(--brand-text-muted)' }} className="text-xs flex-none">
                  · {ddmm(o.data)} · {nComuni} {nComuni === 1 ? 'comune' : 'comuni'}
                </span>
                {o.stato !== 'libero' && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium flex-none"
                    style={{ backgroundColor: st.bg, color: st.fg }}
                  >
                    {st.icon} {st.label}
                  </span>
                )}
                <span className="flex-none text-xs" style={{ color: 'var(--brand-text-subtle)' }}>
                  {aperto ? '▾' : '▸'}
                </span>
              </Button>
              <div className="flex-none text-right">
                <div className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>{o.righe.length}</div>
                <div className="text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>
                  {selezionabile ? `${selDe} selez.` : 'esclusi'}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onScarta(o)}
                title="Rimuovi dall'anteprima (non verrà pianificato)"
                aria-label={`rimuovi ${o.nome} dall'anteprima`}
                className="flex-none h-7 w-7 p-0"
              >
                ✕
              </Button>
            </div>

            {aperto && (
              <div className="px-4 pb-3 space-y-3">
                {o.comuni.map((c) => {
                  const cst = STATO[c.stato];
                  const cSel = c.righe.filter((r) => selezione.has(r.id)).length;
                  const cLibero = c.stato === 'libero';
                  return (
                    <div key={c.comune} className="rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
                      <div
                        className="flex items-center gap-2 px-3 py-1.5 text-xs border-b"
                        style={{ borderColor: 'var(--brand-border)' }}
                      >
                        <span style={{ color: 'var(--brand-text-muted)' }}>⌖</span>
                        <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{c.comune || '—'}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: cst.bg, color: cst.fg }}
                        >
                          {cst.icon} {c.stato === 'conflitto' ? `già pianificato ${ddmm(o.data)}` : cst.label}
                        </span>
                        <span className="ml-auto" style={{ color: 'var(--brand-text-muted)' }}>
                          {c.righe.length} interventi{cLibero ? ` · ${cSel} selez.` : ''}
                        </span>
                      </div>
                      <div className="overflow-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr style={{ color: 'var(--brand-text-muted)' }}>
                              <th className="px-2 py-1.5 font-medium"></th>
                              {['ODL', 'Matricola', 'Indirizzo', 'Esito'].map((h) => (
                                <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {c.righe.map((r) => {
                              const er = r.odl && esitoPerOdl ? esitoPerOdl.get(r.odl) : undefined;
                              const okLock = !!okIds && okIds.has(r.id);
                              const err = ESITO_ERR(er?.esito) && !er?.dry_run;
                              return (
                              <tr
                                key={r.id}
                                style={{
                                  borderTop: '1px solid var(--brand-border)',
                                  color: 'var(--brand-text-main)',
                                  backgroundColor: err ? 'var(--danger-soft)' : okLock ? 'var(--success-soft)' : undefined,
                                  boxShadow: err ? 'inset 3px 0 0 var(--danger)' : undefined,
                                }}
                              >
                                <td className="px-2 py-1.5">
                                  <input
                                    type="checkbox"
                                    disabled={!cLibero || okLock}
                                    aria-label={`seleziona intervento ${r.odl ?? r.id}`}
                                    checked={!okLock && selezione.has(r.id)}
                                    onChange={() => onToggleRiga(r.id)}
                                  />
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.odl ?? '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.matricola ?? '—'}</td>
                                <td className="px-2 py-1.5">{r.indirizzo ?? '—'}</td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                  {okLock && (
                                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--success-soft)', color: 'var(--success)' }}>✓ fatto</span>
                                  )}
                                  {err && (
                                    <span title={er?.motivo ?? ''} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>
                                      <span aria-hidden>⚠</span>{er?.esito === 'non assegnato' ? 'non assegn.' : 'errore'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </section>
  );
}
