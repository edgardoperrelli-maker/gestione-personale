'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { GruppoAnteprima, OperatoreAnteprima, StatoOp } from '@/lib/agente/costruisciAnteprima';

export type RigaPianificabile = {
  id: string;
  file: string;
  riga: number;
  odl: string | null;
  matricola: string | null;
  indirizzo: string | null;
  comune: string | null;
  data: string;
  esecutore: string | null;
  scansionato_il: string;
};

export type FileConfig = {
  file: string;
  committente: string;
  attivita: string;
  template_id: string | null;
};

export type StoricoRiga = {
  data_pianificata: string;
  comune: string;
  file: string | null;
  staff_name: string | null;
  n_interventi: number;
  creato_il: string;
};

const card = { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' } as const;

const STATO: Record<StatoOp, { label: string; icon: string; bg: string; fg: string }> = {
  libero:      { label: 'libero',            icon: '✓', bg: 'var(--success-soft)', fg: 'var(--success)' },
  conflitto:   { label: 'già pianificato',   icon: '⚠', bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  ambiguo:     { label: 'esecutore ambiguo', icon: '?', bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
  non_risolto: { label: 'non risolto',       icon: '?', bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
};

function oggiPiuUno(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function iniziali(nome: string): string {
  const t = nome.trim().split(/\s+/);
  if (!t[0]) return '—';
  return (t[0][0] + (t[1]?.[0] ?? '')).toUpperCase();
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
}

export default function AssegnazioneAiClient({
  righe,
  fileConfig,
  pianificaData,
}: {
  righe: RigaPianificabile[];
  fileConfig: FileConfig[];
  pianificaData: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<string>(oggiPiuUno);
  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [procedendo, setProcedendo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  const [gruppi, setGruppi] = useState<GruppoAnteprima[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(() => new Set());
  const [espansi, setEspansi] = useState<Set<string>>(() => new Set());
  const [storico, setStorico] = useState<StoricoRiga[]>([]);

  const cfgByFile = new Map(fileConfig.map((fc) => [fc.file, fc]));
  const idsKey = righe.map((r) => r.id).join(',');

  const caricaStorico = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/agente/assegnazioni');
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStorico((j.righe ?? []) as StoricoRiga[]);
    } catch { /* informativo */ }
  }, []);

  const caricaAnteprima = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setGruppi([]); setSelezione(new Set()); return; }
    setCaricando(true);
    try {
      const res = await fetch('/api/admin/agente/anteprima', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json().catch(() => ({}));
      const gr = (res.ok ? j.gruppi ?? [] : []) as GruppoAnteprima[];
      setGruppi(gr);
      const sel = new Set<string>();
      for (const g of gr) for (const o of g.operatori) if (o.stato === 'libero') for (const r of o.righe) sel.add(r.id);
      setSelezione(sel);
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => { void caricaStorico(); }, [caricaStorico]);
  useEffect(() => { void caricaAnteprima(idsKey ? idsKey.split(',') : []); }, [idsKey, caricaAnteprima]);

  async function leggi() {
    setArming(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/leggi-pianificabili', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setMsg('In attesa: l’agente legge il giorno al prossimo contatto (entro 1 min).'); router.refresh(); }
      else setMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setArming(false); }
  }

  async function procedi() {
    if (selezione.size === 0) return;
    setProcedendo(true); setEsito(null);
    try {
      const res = await fetch('/api/admin/agente/assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selezione] }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        const conf = (j.conflitti ?? []) as { staff_name: string | null; comune: string; data: string }[];
        const nr = (j.nonRisolti ?? []) as { esecutore: string; motivo: string; n: number }[];
        const avvisi = (j.avvisi ?? []) as string[];
        let m = `Creati ${j.pianiCreati ?? 0} piani, ${j.rapportiniCreati ?? 0} rapportini.`;
        if (conf.length) m += ` Non assegnati (già pianificati): ${conf.map((c) => `${c.staff_name ?? '—'} a ${c.comune} il ${c.data}`).join(', ')}.`;
        if (nr.length) m += ` Operatori non risolti: ${nr.map((x) => `${x.esecutore} (${x.motivo}, ${x.n})`).join(', ')}.`;
        if (avvisi.length) m += ` Avvisi: ${avvisi.join(' · ')}`;
        setEsito(m);
        void caricaStorico();
        void caricaAnteprima(righe.map((r) => r.id)); // ricalcola i conflitti: gli operatori appena assegnati passano a 'conflitto' e si deselezionano
        router.refresh();
      } else setEsito(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setEsito(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setProcedendo(false); }
  }

  function toggleRiga(id: string) {
    setSelezione((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleOperatore(o: OperatoreAnteprima) {
    if (o.stato !== 'libero') return;
    setSelezione((prev) => {
      const n = new Set(prev);
      const tutte = o.righe.every((r) => n.has(r.id));
      for (const r of o.righe) { if (tutte) n.delete(r.id); else n.add(r.id); }
      return n;
    });
  }
  function toggleEspandi(key: string) {
    setEspansi((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  async function scarta(o: OperatoreAnteprima) {
    if (!window.confirm(`Rimuovere ${o.nome} dall'anteprima? Le sue ${o.righe.length} righe NON verranno pianificate (potrai ricaricarle con "Leggi dal file").`)) return;
    try {
      const res = await fetch('/api/admin/agente/scarta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: o.righe.map((r) => r.id) }),
      });
      if (res.ok) { void caricaAnteprima(righe.map((r) => r.id)); router.refresh(); }
    } catch { /* noop */ }
  }

  const operatoriTot = gruppi.reduce((s, g) => s + g.operatori.length, 0);
  const daRisolvere = gruppi.reduce((s, g) => s + g.operatori.filter((o) => o.stato === 'non_risolto' || o.stato === 'ambiguo').length, 0);
  const conflitti = gruppi.reduce((s, g) => s + g.operatori.filter((o) => o.stato === 'conflitto').length, 0);
  const comuni = new Set(gruppi.map((g) => g.comune)).size;
  const liberi = gruppi.flatMap((g) => g.operatori.filter((o) => o.stato === 'libero'));
  const assegnabili = liberi.reduce((s, o) => s + o.righe.length, 0);
  const rapportiniDaCreare = liberi.filter((o) => o.righe.some((r) => selezione.has(r.id)));
  const pianiDaCreare = gruppi.filter((g) => g.operatori.some((o) => o.stato === 'libero' && o.righe.some((r) => selezione.has(r.id)))).length;
  const sottoOperatori = [conflitti > 0 ? `${conflitti} in conflitto` : null, daRisolvere > 0 ? `${daRisolvere} da risolvere` : null].filter(Boolean).join(' · ');

  const tile = (icon: string, label: string, value: ReactNode) => (
    <div className="rounded-xl border p-3" style={card}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--brand-text-muted)' }}>{icon} {label}</div>
      <div className="mt-0.5 text-2xl font-semibold" style={{ color: 'var(--brand-text-main)' }}>{value}</div>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>Assegnazione AI</h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Pianificazione automatica degli interventi dal file.</p>
      </header>

      <section className="rounded-2xl border p-5 space-y-3" style={card}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Lettura file</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="assegnazione-data" className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Giorno da pianificare</label>
            <input id="assegnazione-data" type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="block rounded-xl border px-3 py-1.5 text-sm outline-none"
              style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }} />
          </div>
          <button type="button" onClick={() => void leggi()} disabled={arming}
            className="rounded-xl border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60"
            style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}>
            {arming ? 'Invio…' : 'Leggi dal file'}
          </button>
        </div>
        {pianificaData && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}>
            <span>⏳ In attesa di lettura per il giorno {pianificaData}</span>
            <button type="button" onClick={() => router.refresh()} className="ml-auto rounded-lg border px-2 py-0.5 text-xs font-medium" style={{ borderColor: 'var(--brand-border)' }}>↻ Aggiorna</button>
          </div>
        )}
        {msg && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>}
      </section>

      {righe.length === 0 ? (
        <section className="rounded-2xl border p-8 text-center" style={card}>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna riga pianificabile. Usa &quot;Leggi dal file&quot; per caricare i dati.</p>
        </section>
      ) : (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            {tile('▦', 'Righe lette', righe.length)}
            {tile('☻', 'Operatori', <>{operatoriTot}{sottoOperatori && <span className="text-sm font-normal" style={{ color: 'var(--brand-text-muted)' }}> · {sottoOperatori}</span>}</>)}
            {tile('⌖', 'Comuni', comuni)}
            {tile('✔', 'Assegnabili', assegnabili)}
          </div>

          {conflitti > 0 && (
            <div className="flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm"
              style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}>
              <span style={{ color: 'var(--warning)' }}>⚠</span>
              <span>{conflitti} operatore{conflitti > 1 ? 'i' : ''} già pianificato in quel comune+giorno → escluso dall’assegnazione (i suoi rapportini non si toccano).</span>
            </div>
          )}

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Anteprima pianificazione</h2>
              {caricando && <span className="text-xs" style={{ color: 'var(--brand-text-subtle)' }}>aggiorno…</span>}
            </div>

            {gruppi.map((g) => (
              <div key={`${g.data}|${g.comune}`} className="rounded-2xl border overflow-hidden" style={card}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="flex items-center gap-2 text-sm">
                    <span style={{ color: 'var(--brand-text-muted)' }}>⌖</span>
                    <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{g.comune || '—'}</span>
                    <span style={{ color: 'var(--brand-text-muted)' }}>· {ddmm(g.data)} · {g.operatori.length} operatori · {g.operatori.reduce((s, o) => s + o.righe.length, 0)} interventi</span>
                  </div>
                </div>

                {g.operatori.map((o) => {
                  const st = STATO[o.stato];
                  const selezionabile = o.stato === 'libero';
                  const selDe = o.righe.filter((r) => selezione.has(r.id)).length;
                  const aperto = espansi.has(o.key);
                  return (
                    <div key={o.key} className="border-b last:border-b-0" style={{ borderColor: 'var(--brand-border)' }}>
                      <div className="flex items-center gap-3 px-4 py-2.5" style={{ opacity: selezionabile ? 1 : 0.7 }}>
                        <input type="checkbox" disabled={!selezionabile} aria-label={`seleziona ${o.nome}`}
                          checked={selezionabile && selDe === o.righe.length && o.righe.length > 0}
                          ref={(el) => { if (el) el.indeterminate = selezionabile && selDe > 0 && selDe < o.righe.length; }}
                          onChange={() => toggleOperatore(o)} />
                        <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold"
                          style={{ backgroundColor: st.bg, color: st.fg }}>{o.staffId ? iniziali(o.nome) : '?'}</div>
                        <button type="button" onClick={() => toggleEspandi(o.key)} className="flex flex-1 items-center gap-2 text-left min-w-0">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--brand-text-main)' }}>{o.nome}</span>
                          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium flex-none" style={{ backgroundColor: st.bg, color: st.fg }}>
                            {st.icon} {o.stato === 'conflitto' ? `già pianificato ${ddmm(g.data)}` : st.label}
                          </span>
                          <span className="flex-none text-xs" style={{ color: 'var(--brand-text-subtle)' }}>{aperto ? '▾' : '▸'}</span>
                        </button>
                        <div className="flex-none text-right">
                          <div className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>{o.righe.length}</div>
                          <div className="text-[11px]" style={{ color: 'var(--brand-text-muted)' }}>{selezionabile ? `${selDe} selez.` : 'esclusi'}</div>
                        </div>
                        <button type="button" onClick={() => void scarta(o)} title="Rimuovi dall'anteprima (non verrà pianificato)"
                          aria-label={`rimuovi ${o.nome} dall'anteprima`}
                          className="flex-none flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:opacity-100"
                          style={{ color: 'var(--brand-text-subtle)', backgroundColor: 'var(--brand-surface-2)', opacity: 0.7 }}>
                          ✕
                        </button>
                      </div>

                      {aperto && (
                        <div className="overflow-auto px-4 pb-3">
                          <table className="w-full border-collapse text-left text-xs">
                            <thead>
                              <tr style={{ color: 'var(--brand-text-muted)' }}>
                                <th className="px-2 py-1.5 font-medium"></th>
                                {['ODL', 'Matricola', 'Indirizzo', 'Gruppo attività', 'Committente'].map((h) => (
                                  <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {o.righe.map((r) => {
                                const cfg = cfgByFile.get(r.file);
                                return (
                                  <tr key={r.id} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                                    <td className="px-2 py-1.5">
                                      <input type="checkbox" disabled={!selezionabile} aria-label={`seleziona intervento ${r.odl ?? r.id}`}
                                        checked={selezione.has(r.id)} onChange={() => toggleRiga(r.id)} />
                                    </td>
                                    <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.odl ?? '—'}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.matricola ?? '—'}</td>
                                    <td className="px-2 py-1.5">{r.indirizzo ?? '—'}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap">{cfg?.attivita ?? '—'}</td>
                                    <td className="px-2 py-1.5 whitespace-nowrap">{cfg?.committente ?? '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--brand-primary-border)', backgroundColor: 'var(--brand-surface)', boxShadow: 'var(--shadow-md)' }}>
              <div className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{rapportiniDaCreare.length} operatori · {selezione.size} interventi</span>
                {' '}→ crea {pianiDaCreare} {pianiDaCreare === 1 ? 'piano' : 'piani'}, {rapportiniDaCreare.length} rapportini
              </div>
              <button type="button" onClick={() => void procedi()} disabled={procedendo || selezione.size === 0}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)', boxShadow: selezione.size ? 'var(--shadow-hover)' : 'none' }}>
                ▶ {procedendo ? 'Creo…' : 'Procedi'}
              </button>
            </div>
            {esito && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{esito}</p>}
          </section>
        </>
      )}

      <section className="rounded-2xl border p-5 space-y-3" style={card}>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--brand-text-main)' }}>Storico assegnazioni</h2>
        {(() => {
          const delGiorno = storico.filter((s) => s.data_pianificata === data);
          if (delGiorno.length === 0) return null;
          return (
            <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}>
              ⚠️ Il giorno {data} risulta già assegnato: {delGiorno.map((s) => `${s.staff_name ?? '—'} (${s.comune}, ${s.n_interventi})`).join(', ')}.
            </div>
          );
        })()}
        {storico.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna assegnazione registrata.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--brand-text-muted)' }}>
                  {['Giorno', 'Comune', 'Operatore', 'N. interventi', 'Creato il'].map((h) => (
                    <th key={h} className="px-2 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {storico.map((s, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{s.data_pianificata}</td>
                    <td className="px-2 py-1.5">{s.comune}</td>
                    <td className="px-2 py-1.5">{s.staff_name ?? '—'}</td>
                    <td className="px-2 py-1.5">{s.n_interventi}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{new Date(s.creato_il).toLocaleString('it-IT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
