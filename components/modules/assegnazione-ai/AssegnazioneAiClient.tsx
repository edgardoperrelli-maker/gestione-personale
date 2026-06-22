'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { GruppoOperatore, StatoOp } from '@/lib/agente/costruisciAnteprima';
import { raggruppaCommessaAttivita } from '@/lib/agente/raggruppaCommessaAttivita';

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

export type AceaEsitoRiga = { odl: string; operatore_acea: string | null; esito: string; motivo: string | null; dry_run: boolean; creato_il: string };
export type AceaEsiti = {
  ultimoRun: { giorno: string | null; dryRun: boolean; lavori: number; aggiornate: number; scartati: number; errore: string | null; creato_il: string } | null;
  righe: AceaEsitoRiga[];
  riepilogo: Record<string, number>;
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

  const [aceaDry, setAceaDry] = useState(true);
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);
  const [aceaEsiti, setAceaEsiti] = useState<AceaEsiti | null>(null);
  const [aceaCheck, setAceaCheck] = useState(false);

  const [gruppi, setGruppi] = useState<GruppoOperatore[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(() => new Set());
  const [espansi, setEspansi] = useState<Set<string>>(() => new Set());
  const [storico, setStorico] = useState<StoricoRiga[]>([]);

  const cfgByFile = new Map(fileConfig.map((fc) => [fc.file, fc]));
  const idsKey = righe.map((r) => r.id).join(',');

  // tab commessa → attività (data-driven da agente_file_config)
  const alberi = raggruppaCommessaAttivita(righe.map((r) => ({ id: r.id, file: r.file })), fileConfig);
  const [commessaSel, setCommessaSel] = useState<string>('');
  const [attivitaSel, setAttivitaSel] = useState<string>('');
  const commessaCorrente = alberi.find((c) => c.committente === commessaSel);
  const attivitaCorrente = commessaCorrente?.attivita.find((a) => a.attivita === attivitaSel);
  const idsAttivita = attivitaCorrente?.ids ?? [];
  const idsAttivitaKey = idsAttivita.join(',');
  const isAcea = commessaSel === 'acea';
  // ODL ACEA "Cruscotto" (Dunning, NON Limitazioni Massive) letti per il giorno selezionato:
  // è ciò che la "Scrivi su ACEA" assegnerà. Se 0 → niente da assegnare per quel giorno.
  const odlAceaPerData = righe.filter((r) => {
    if (r.data !== data) return false;
    const fc = cfgByFile.get(r.file);
    return fc?.committente === 'acea' && fc.attivita !== 'LIMITAZIONI MASSIVE';
  }).length;

  const caricaStorico = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (commessaSel) qs.set('committente', commessaSel);
      if (attivitaSel) qs.set('attivita', attivitaSel);
      const res = await fetch(`/api/admin/agente/assegnazioni?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStorico((j.righe ?? []) as StoricoRiga[]);
    } catch { /* informativo */ }
  }, [commessaSel, attivitaSel]);

  // esito dell'assegnazione su ACEA (feedback): ultimo giro + esiti per-ODL del giorno
  const caricaAceaEsiti = useCallback(async (giorno: string) => {
    setAceaCheck(true);
    try {
      const res = await fetch(`/api/admin/agente/acea-esiti?data=${encodeURIComponent(giorno)}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setAceaEsiti(j as AceaEsiti);
    } catch { /* informativo */ } finally { setAceaCheck(false); }
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
      const gr = (res.ok ? j.gruppi ?? [] : []) as GruppoOperatore[];
      setGruppi(gr);
      // preseleziona solo le righe dei comuni liberi di ogni operatore
      const sel = new Set<string>();
      for (const o of gr) for (const c of o.comuni) if (c.stato === 'libero') for (const r of c.righe) sel.add(r.id);
      setSelezione(sel);
    } finally {
      setCaricando(false);
    }
  }, []);

  useEffect(() => { void caricaStorico(); }, [caricaStorico]);
  // sulla commessa ACEA: mostra l'esito dell'ultima assegnazione per il giorno scelto
  useEffect(() => { if (isAcea) void caricaAceaEsiti(data); }, [isAcea, data, caricaAceaEsiti]);

  // default selezione commessa/attività quando cambiano le righe lette
  useEffect(() => {
    if (alberi.length === 0) { setCommessaSel(''); setAttivitaSel(''); return; }
    const c = alberi.find((x) => x.committente === commessaSel) ?? alberi[0];
    if (c.committente !== commessaSel) setCommessaSel(c.committente);
    const a = c.attivita.find((x) => x.attivita === attivitaSel) ?? c.attivita[0];
    if (a && a.attivita !== attivitaSel) setAttivitaSel(a.attivita);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // carica l'anteprima dei soli ID dell'attività selezionata
  useEffect(() => { void caricaAnteprima(idsAttivitaKey ? idsAttivitaKey.split(',') : []); }, [idsAttivitaKey, caricaAnteprima]);

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
        void caricaAnteprima(idsAttivita); // ricalcola i conflitti: gli operatori appena assegnati passano a 'conflitto' e si deselezionano
        router.refresh();
      } else setEsito(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setEsito(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setProcedendo(false); }
  }

  async function scriviAcea() {
    setAceaArming(true); setAceaMsg(null);
    try {
      const res = await fetch('/api/admin/agente/acea-assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, dry: aceaDry }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setAceaMsg(
          odlAceaPerData === 0
            ? `⚠️ Richiesta inviata per il ${data}, ma per quel giorno NON risultano ODL Dunning letti: l'agente non avrà nulla da assegnare. Leggi prima dal file o cambia giorno.`
            : `Richiesta inviata (${aceaDry ? 'PROVA' : 'REALE'}) per il ${data} (${odlAceaPerData} ODL): l'agente assegnerà al prossimo contatto (~1 min). L'esito comparirà qui sotto.`,
        );
        // l'agente gira al tick (~1 min): ricontrolla l'esito qualche volta
        for (const ms of [15000, 35000, 60000, 90000]) setTimeout(() => void caricaAceaEsiti(data), ms);
      } else setAceaMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setAceaArming(false); }
  }

  function toggleRiga(id: string) {
    setSelezione((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  // righe selezionabili di un operatore = quelle dei suoi comuni liberi
  function righeLibere(o: GruppoOperatore): string[] {
    return o.comuni.filter((c) => c.stato === 'libero').flatMap((c) => c.righe.map((r) => r.id));
  }
  function toggleOperatore(o: GruppoOperatore) {
    const ids = righeLibere(o);
    if (ids.length === 0) return;
    setSelezione((prev) => {
      const n = new Set(prev);
      const tutte = ids.every((id) => n.has(id));
      for (const id of ids) { if (tutte) n.delete(id); else n.add(id); }
      return n;
    });
  }
  function toggleEspandi(key: string) {
    setEspansi((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }
  async function scarta(o: GruppoOperatore) {
    if (!window.confirm(`Rimuovere ${o.nome} dall'anteprima? Le sue ${o.righe.length} righe NON verranno pianificate (potrai ricaricarle con "Leggi dal file").`)) return;
    try {
      const res = await fetch('/api/admin/agente/scarta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: o.righe.map((r) => r.id) }),
      });
      if (res.ok) { void caricaAnteprima(idsAttivita); router.refresh(); }
    } catch { /* noop */ }
  }

  const operatoriTot = gruppi.length;
  const daRisolvere = gruppi.filter((o) => o.stato === 'non_risolto' || o.stato === 'ambiguo').length;
  const conflitti = gruppi.filter((o) => o.stato === 'conflitto').length;
  const comuni = new Set(gruppi.flatMap((o) => o.comuni.map((c) => c.comune))).size;
  const assegnabili = gruppi.flatMap((o) => o.comuni.filter((c) => c.stato === 'libero')).reduce((s, c) => s + c.righe.length, 0);
  const operatoriDaCreare = gruppi.filter((o) => righeLibere(o).some((id) => selezione.has(id)));
  // piani = un piano per (data, comune); rapportini = uno per (operatore, comune libero) selezionato
  const pianiDaCreare = new Set(
    gruppi.flatMap((o) => o.comuni.filter((c) => c.stato === 'libero' && c.righe.some((r) => selezione.has(r.id))).map((c) => `${o.data}|${c.comune}`)),
  ).size;
  const rapportiniDaCreareN = gruppi.reduce((s, o) => s + o.comuni.filter((c) => c.stato === 'libero' && c.righe.some((r) => selezione.has(r.id))).length, 0);
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

      {alberi.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {alberi.map((c) => (
              <button key={c.committente} type="button"
                onClick={() => { setCommessaSel(c.committente); setAttivitaSel(c.attivita[0]?.attivita ?? ''); }}
                className="rounded-xl border px-3 py-1.5 text-sm font-semibold capitalize transition"
                style={{
                  borderColor: c.committente === commessaSel ? 'var(--brand-primary)' : 'var(--brand-border)',
                  backgroundColor: c.committente === commessaSel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                  color: 'var(--brand-text-main)',
                }}>
                {c.committente} <span style={{ color: 'var(--brand-text-muted)' }}>· {c.ids.length}</span>
              </button>
            ))}
          </div>
          {commessaCorrente && commessaCorrente.attivita.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-1">
              {commessaCorrente.attivita.map((a) => (
                <button key={a.attivita} type="button" onClick={() => setAttivitaSel(a.attivita)}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium transition"
                  style={{
                    borderColor: a.attivita === attivitaSel ? 'var(--brand-primary)' : 'var(--brand-border)',
                    backgroundColor: a.attivita === attivitaSel ? 'var(--brand-primary-soft)' : 'var(--brand-surface)',
                    color: 'var(--brand-text-main)',
                  }}>
                  {a.attivita} <span style={{ color: 'var(--brand-text-muted)' }}>· {a.ids.length}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isAcea && (
        <section className="rounded-2xl border p-4 space-y-2" style={card}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Assegna interventi su ACEA (WEB Appalti)</h2>
          <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
            Assegna sul portale ACEA gli ODL agli operatori del giorno, leggendo direttamente le righe del file (Data + Esecutore) — <strong>indipendente da &quot;Procedi&quot;/rapportini</strong>. Gli ODL già assegnati vengono saltati. Usa &quot;Prova&quot; per simulare senza scrivere.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm" style={{ color: 'var(--brand-text-main)' }}>
              Giorno: <strong>{data}</strong>
              <span style={{ color: odlAceaPerData === 0 ? 'var(--warning)' : 'var(--brand-text-muted)' }}> · {odlAceaPerData} ODL Dunning</span>
            </span>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--brand-text-main)' }}>
              <input type="checkbox" checked={aceaDry} onChange={(e) => setAceaDry(e.target.checked)} /> Prova (non scrive)
            </label>
            <button type="button" onClick={() => void scriviAcea()} disabled={aceaArming}
              className="rounded-xl border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60"
              style={{ borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-text-main)' }}>
              {aceaArming ? 'Invio…' : (aceaDry ? '▶ Prova su ACEA' : '▶ Scrivi su ACEA')}
            </button>
          </div>
          {aceaMsg && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{aceaMsg}</p>}

          {/* Esito assegnazione su ACEA — feedback, così "Scrivi su ACEA" non è più silenzioso */}
          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface-2)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--brand-text-main)' }}>Esito assegnazione ACEA</span>
              <button type="button" onClick={() => void caricaAceaEsiti(data)} disabled={aceaCheck}
                className="ml-auto rounded-lg border px-2 py-0.5 text-xs font-medium disabled:opacity-60"
                style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                {aceaCheck ? '…' : '↻ Aggiorna esito'}
              </button>
            </div>
            {aceaEsiti?.ultimoRun ? (
              <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                Ultimo giro: <strong>{aceaEsiti.ultimoRun.dryRun ? 'PROVA' : 'REALE'}</strong> · giorno {aceaEsiti.ultimoRun.giorno ?? '—'} · {aceaEsiti.ultimoRun.lavori} ODL · {new Date(aceaEsiti.ultimoRun.creato_il).toLocaleString('it-IT')}
                {aceaEsiti.ultimoRun.lavori === 0 && <span style={{ color: 'var(--warning)' }}> — 0 ODL: niente da assegnare per quel giorno.</span>}
                {aceaEsiti.ultimoRun.errore && <span style={{ color: 'var(--danger)' }}> — errore: {aceaEsiti.ultimoRun.errore}</span>}
              </p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>Nessun giro ACEA ancora registrato.</p>
            )}
            {aceaEsiti && Object.keys(aceaEsiti.riepilogo).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(aceaEsiti.riepilogo).map(([k, n]) => (
                  <span key={k} className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: 'var(--brand-surface)', border: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                    {k}: {n}
                  </span>
                ))}
              </div>
            )}
            {aceaEsiti && aceaEsiti.righe.length > 0 && (
              <div className="overflow-auto" style={{ maxHeight: '14rem' }}>
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr style={{ color: 'var(--brand-text-muted)' }}>
                      {['ODL', 'Operatore', 'Esito', 'Note'].map((h) => (
                        <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {aceaEsiti.righe.slice(0, 100).map((r, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                        <td className="px-2 py-1 whitespace-nowrap font-mono">{r.odl}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.operatore_acea ?? '—'}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{r.esito}{r.dry_run ? ' (prova)' : ''}</td>
                        <td className="px-2 py-1">{r.motivo ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

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

            {gruppi.map((o) => {
              const st = STATO[o.stato];
              const idsLiberi = righeLibere(o);
              const selezionabile = idsLiberi.length > 0;
              const selDe = idsLiberi.filter((id) => selezione.has(id)).length;
              const aperto = espansi.has(o.key);
              const nComuni = o.comuni.length;
              return (
                <div key={o.key} className="rounded-2xl border overflow-hidden" style={card}>
                  <div className="flex items-center gap-3 px-4 py-2.5" style={{ opacity: o.staffId ? 1 : 0.75 }}>
                    <input type="checkbox" disabled={!selezionabile} aria-label={`seleziona ${o.nome}`}
                      checked={selezionabile && selDe === idsLiberi.length}
                      ref={(el) => { if (el) el.indeterminate = selezionabile && selDe > 0 && selDe < idsLiberi.length; }}
                      onChange={() => toggleOperatore(o)} />
                    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-semibold"
                      style={{ backgroundColor: st.bg, color: st.fg }}>{o.staffId ? iniziali(o.nome) : '?'}</div>
                    <button type="button" onClick={() => toggleEspandi(o.key)} className="flex flex-1 items-center gap-2 text-left min-w-0">
                      <span className="text-sm font-semibold truncate" style={{ color: 'var(--brand-text-main)' }}>{o.nome}</span>
                      <span style={{ color: 'var(--brand-text-muted)' }} className="text-xs flex-none">· {ddmm(o.data)} · {nComuni} {nComuni === 1 ? 'comune' : 'comuni'}</span>
                      {o.stato !== 'libero' && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium flex-none" style={{ backgroundColor: st.bg, color: st.fg }}>
                          {st.icon} {st.label}
                        </span>
                      )}
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
                    <div className="px-4 pb-3 space-y-3">
                      {o.comuni.map((c) => {
                        const cst = STATO[c.stato];
                        const cSel = c.righe.filter((r) => selezione.has(r.id)).length;
                        const cLibero = c.stato === 'libero';
                        return (
                          <div key={c.comune} className="rounded-xl border" style={{ borderColor: 'var(--brand-border)' }}>
                            <div className="flex items-center gap-2 px-3 py-1.5 text-xs border-b" style={{ borderColor: 'var(--brand-border)' }}>
                              <span style={{ color: 'var(--brand-text-muted)' }}>⌖</span>
                              <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{c.comune || '—'}</span>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: cst.bg, color: cst.fg }}>
                                {cst.icon} {c.stato === 'conflitto' ? `già pianificato ${ddmm(o.data)}` : cst.label}
                              </span>
                              <span className="ml-auto" style={{ color: 'var(--brand-text-muted)' }}>{c.righe.length} interventi{cLibero ? ` · ${cSel} selez.` : ''}</span>
                            </div>
                            <div className="overflow-auto">
                              <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                  <tr style={{ color: 'var(--brand-text-muted)' }}>
                                    <th className="px-2 py-1.5 font-medium"></th>
                                    {['ODL', 'Matricola', 'Indirizzo'].map((h) => (
                                      <th key={h} className="px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.righe.map((r) => (
                                    <tr key={r.id} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
                                      <td className="px-2 py-1.5">
                                        <input type="checkbox" disabled={!cLibero} aria-label={`seleziona intervento ${r.odl ?? r.id}`}
                                          checked={selezione.has(r.id)} onChange={() => toggleRiga(r.id)} />
                                      </td>
                                      <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.odl ?? '—'}</td>
                                      <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.matricola ?? '—'}</td>
                                      <td className="px-2 py-1.5">{r.indirizzo ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
              style={{ borderColor: 'var(--brand-primary-border)', backgroundColor: 'var(--brand-surface)', boxShadow: 'var(--shadow-md)' }}>
              <div className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>{operatoriDaCreare.length} operatori · {selezione.size} interventi</span>
                {' '}→ crea {pianiDaCreare} {pianiDaCreare === 1 ? 'piano' : 'piani'}, {rapportiniDaCreareN} rapportini
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
