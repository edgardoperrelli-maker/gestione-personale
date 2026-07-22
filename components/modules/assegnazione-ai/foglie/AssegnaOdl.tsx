'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { NavState } from '@/lib/agente/aceaNav';
import type { GruppoOperatore } from '@/lib/agente/costruisciAnteprima';
import type { RigaPianificabile, FileConfig, AceaEsiti, AceaEsitoRiga, StoricoRiga } from '../tipi';
import { AnteprimaPianificazione, righeLibere } from '../AnteprimaPianificazione';
import { esitoEffettivoPerOdl } from '@/lib/agente/aceaBadgePerRisorsa';
import { PannelloAceaAssegna } from '../PannelloAceaAssegna';
import { useAttesaAgente } from '../useAttesaAgente';
import { BarraAttesaAgente } from '../BarraAttesaAgente';
import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import DatePicker from '@/components/ui/DatePicker';

// ─── Helper ──────────────────────────────────────────────────────────────────

function oggiPiuUno(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Props ───────────────────────────────────────────────────────────────────

type AssegnaOdlProps = {
  nav: NavState;
  righe: RigaPianificabile[];
  fileConfig: FileConfig[];
  pianificaData: string | null;
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function AssegnaOdl({ nav, righe, fileConfig, pianificaData }: AssegnaOdlProps) {
  const router = useRouter();
  // ── Stato locale ─────────────────────────────────────────────────────────
  const [data, setData] = useState<string>(oggiPiuUno);

  // leggi
  const [arming, setArming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // anteprima
  const [gruppi, setGruppi] = useState<GruppoOperatore[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [selezione, setSelezione] = useState<Set<string>>(() => new Set());
  const [espansi, setEspansi] = useState<Set<string>>(() => new Set());

  // procedi
  const [procedendo, setProcedendo] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);

  // storico assegnazioni
  const [storico, setStorico] = useState<StoricoRiga[]>([]);
  const [storicoAperto, setStoricoAperto] = useState(false);

  // territorio macro (ACEA, LAZIO CENTRO, …) scelto al "Crea rapportini"
  const [territori, setTerritori] = useState<Array<{ id: string; name: string }>>([]);
  const [territorioModale, setTerritorioModale] = useState(false);
  const [territorioSel, setTerritorioSel] = useState('');

  // ACEA
  const [aceaDry, setAceaDry] = useState(true);
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);
  const [aceaEsiti, setAceaEsiti] = useState<AceaEsiti | null>(null);
  const [preEsiti, setPreEsiti] = useState<AceaEsitoRiga[]>([]);
  const [aceaCheck, setAceaCheck] = useState(false);
  const [esitoAperto, setEsitoAperto] = useState(false); // card esiti ACEA: chiusa, si apre quando assegni
  const [dispatchedAtAcea, setDispatchedAtAcea] = useState<number | null>(null);
  const [baselineAceaTs, setBaselineAceaTs] = useState<string | null>(null);

  // ── Filtra righe per questa commessa+attività ─────────────────────────────
  const isLm = nav.attivita === 'lm';
  const cfgByFile = new Map(fileConfig.map((fc) => [fc.file, fc]));

  const righeAttivita = righe.filter((r) => {
    const fc = cfgByFile.get(r.file);
    if (!fc) return false;
    if (fc.committente !== 'acea') return false;
    if (isLm) return fc.attivita === 'LIMITAZIONI MASSIVE';
    // dunning = ACEA non-LM
    return fc.attivita !== 'LIMITAZIONI MASSIVE';
  });

  const idsAttivita = righeAttivita.map((r) => r.id);
  const idsAttivitaKey = idsAttivita.join(',');


  // ── Fetch handlers (verbatim dal monolite) ────────────────────────────────

  // deriva l'attività dalla prima riga (es. "LIMITAZIONI MASSIVE" o il valore dunning)
  const attivitaLabel = (() => {
    const firstFile = righeAttivita[0]?.file;
    if (!firstFile) return '';
    return cfgByFile.get(firstFile)?.attivita ?? '';
  })();

  const caricaStorico = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ committente: 'acea' });
      if (attivitaLabel) qs.set('attivita', attivitaLabel);
      const res = await fetch(`/api/admin/agente/assegnazioni?${qs.toString()}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setStorico((j.righe ?? []) as StoricoRiga[]);
    } catch { /* informativo */ }
  }, [attivitaLabel]);

  const caricaAceaEsiti = useCallback(async (giorno: string) => {
    setAceaCheck(true);
    try {
      const res = await fetch(`/api/admin/agente/acea-esiti?data=${encodeURIComponent(giorno)}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) setAceaEsiti(j as AceaEsiti);
    } catch { /* informativo */ } finally { setAceaCheck(false); }
  }, []);

  // pre-marcatura proattiva: ODL già assegnati su ACEA alla risorsa giusta (prima ancora di assegnare)
  const caricaPreassegnati = useCallback(async (giorno: string) => {
    try {
      const res = await fetch(`/api/admin/agente/acea-preassegnati?data=${encodeURIComponent(giorno)}`);
      const j = await res.json().catch(() => ({}));
      setPreEsiti(res.ok ? ((j.righe ?? []) as AceaEsitoRiga[]) : []);
    } catch { setPreEsiti([]); }
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
      const sel = new Set<string>();
      for (const o of gr) for (const c of o.comuni) if (c.stato === 'libero') for (const r of c.righe) sel.add(r.id);
      setSelezione(sel);
    } finally {
      setCaricando(false);
    }
  }, []);

  async function leggi() {
    setArming(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/agente/leggi-pianificabili', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setMsg('In attesa: l\'agente legge il giorno al prossimo contatto (entro 1 min).'); router.refresh(); }
      else setMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setArming(false); }
  }

  async function procedi(territorioScelto: string) {
    if (selezione.size === 0 || !territorioScelto) return;
    setTerritorioModale(false);
    setProcedendo(true); setEsito(null);
    try {
      const res = await fetch('/api/admin/agente/assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selezione], territorio: territorioScelto }),
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
        void caricaAnteprima(idsAttivita);
        void caricaStorico();
        router.refresh();
      } else setEsito(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setEsito(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setProcedendo(false); }
  }

  async function scriviAcea() {
    if (odlSelezionati.length === 0) { setAceaMsg('Seleziona prima gli interventi da assegnare su ACEA.'); return; }
    setAceaArming(true); setAceaMsg(null); setEsitoAperto(true);
    const giorno = dataSelez;
    const baseline = aceaEsiti?.ultimoRun?.creato_il ?? null;
    try {
      const res = await fetch('/api/admin/agente/acea-assegna', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: giorno, dry: aceaDry, odls: odlSelezionati }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setAceaMsg(
          `Richiesta inviata (${aceaDry ? 'PROVA' : 'REALE'}) per ${odlSelezionati.length} ODL selezionati del ${giorno}: l'agente assegnerà al prossimo contatto (~1 min). L'esito comparirà qui sotto.`,
        );
        // la barra "In attesa dell'agente" + il polling continuo subentrano al vecchio polling fisso
        setBaselineAceaTs(baseline);
        setDispatchedAtAcea(Date.now());
      } else setAceaMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setAceaArming(false); }
  }

  async function scarta(o: GruppoOperatore) {
    if (!(await chiediConferma({ title: `Rimuovere ${o.nome} dall'anteprima?`, message: `Le sue ${o.righe.length} righe NON verranno pianificate (potrai ricaricarle con "Sincronizza file").`, confirmLabel: 'Rimuovi' }))) return;
    try {
      const res = await fetch('/api/admin/agente/scarta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: o.righe.map((r) => r.id) }),
      });
      if (res.ok) { void caricaAnteprima(idsAttivita); router.refresh(); }
    } catch { /* noop */ }
  }

  // ── Toggle selezione ──────────────────────────────────────────────────────

  function toggleRiga(id: string) {
    setSelezione((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function toggleOperatore(o: GruppoOperatore) {
    const ids = righeLibere(o, okIds);
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

  // ── Effetti ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void caricaAnteprima(idsAttivitaKey ? idsAttivitaKey.split(',') : []);
  }, [idsAttivitaKey, caricaAnteprima]);

  useEffect(() => {
    if (!isLm) { void caricaAceaEsiti(data); void caricaPreassegnati(data); }
  }, [isLm, data, caricaAceaEsiti, caricaPreassegnati]);

  // Quando arrivano gli esiti ACEA (o i pre-assegnati), togli dalla selezione gli ODL già OK: non azionabili.
  useEffect(() => {
    const okOdl = new Set([...(aceaEsiti?.righe ?? []), ...preEsiti]
      .filter((r) => r.odl && (r.esito === 'assegnato' || r.esito === 'gia-assegnato'))
      .map((r) => r.odl));
    if (okOdl.size === 0) return;
    setSelezione((prev) => {
      let cambiato = false;
      const n = new Set(prev);
      for (const o of gruppi) for (const r of o.righe) {
        if (r.odl && okOdl.has(r.odl) && n.has(r.id)) { n.delete(r.id); cambiato = true; }
      }
      return cambiato ? n : prev;
    });
  }, [aceaEsiti?.righe, preEsiti, gruppi]);

  useEffect(() => {
    void caricaStorico();
  }, [caricaStorico]);

  // lista territori (macro) per il selettore al "Crea rapportini"
  useEffect(() => {
    let attivo = true;
    fetch('/api/mappa/territori').then((r) => r.json())
      .then((d) => { if (attivo) setTerritori(Array.isArray(d) ? d : []); })
      .catch(() => { if (attivo) setTerritori([]); });
    return () => { attivo = false; };
  }, []);

  // ── Contatori barra azioni ────────────────────────────────────────────────

  // Esiti per-ODL (dry_run-aware) + pre-marcatura proattiva (pre-assegnati su ACEA) → lock/badge.
  const esitoPerOdl = esitoEffettivoPerOdl(aceaEsiti?.righe ?? null);
  for (const r of preEsiti) if (r.odl && !esitoPerOdl.has(r.odl)) esitoPerOdl.set(r.odl, r);
  const odlOk = (e?: string) => e === 'assegnato' || e === 'gia-assegnato';
  const okIds = new Set<string>();
  for (const o of gruppi) for (const r of o.righe) {
    const e = r.odl ? esitoPerOdl.get(r.odl) : undefined;
    if (e && !e.dry_run && odlOk(e.esito)) okIds.add(r.id);
  }

  // Raggruppamento per TERRITORIO (scelto al "Crea rapportini"): un rapportino per
  // operatore, i comuni vengono accorpati → niente più conteggio per-comune.
  const operatoriDaCreare = gruppi.filter((o) => righeLibere(o, okIds).some((id) => selezione.has(id)));

  // ODL delle righe SELEZIONATE → pilotano "Assegna su ACEA" (sottoinsieme, non tutto il giorno).
  const righeSelez = gruppi.flatMap((o) => o.comuni.flatMap((c) => c.righe)).filter((r) => selezione.has(r.id));
  const odlSelezionati = righeSelez.map((r) => r.odl).filter((x): x is string => !!x);
  const dataSelez = righeSelez[0]?.data ?? data;

  // ── Attesa agente ──────────────────────────────────────────────────────────
  // Assegna su ACEA: fatto = è arrivato un esito 'acea-assegna' più recente del baseline al click.
  // (acea-assegna può durare a lungo → niente soglia di stallo nella barra)
  const fattoAcea =
    dispatchedAtAcea != null &&
    aceaEsiti?.ultimoRun != null &&
    (!baselineAceaTs || aceaEsiti.ultimoRun.creato_il > baselineAceaTs);
  useAttesaAgente({ inAttesa: dispatchedAtAcea != null, fatto: fattoAcea, onPoll: () => void caricaAceaEsiti(dataSelez) });
  // Lettura file: finché pianificaData è valorizzato (segnale server, mostrato nel banner) → ricarica
  useAttesaAgente({ inAttesa: pianificaData != null, fatto: false, onPoll: () => router.refresh() });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Card 1: Sincronizza file */}
      <Card animated={false}>
      <CardContent className="space-y-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
          Sincronizza file
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
              Giorno da pianificare
            </label>
            <DatePicker value={data} onChange={setData} />
          </div>
          <Button
            variant="soft"
            onClick={() => void leggi()}
            disabled={arming}
          >
            {arming ? 'Invio…' : 'Sincronizza file'}
          </Button>
        </div>
        {pianificaData && (
          <div
            className="rounded-xl border px-3 py-2.5 space-y-2"
            style={{ borderColor: 'var(--status-progress-soft)', backgroundColor: 'var(--status-progress-soft)' }}
          >
            <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>
              <span style={{ color: 'var(--status-progress)' }}>⟳</span>
              <span>
                In attesa dell&rsquo;agente — lettura del giorno {pianificaData}…
                <span className="font-normal" style={{ color: 'var(--brand-text-muted)' }}>{' '}(parte entro ~1 min)</span>
              </span>
            </div>
            <div className="barra-indeterminata h-1.5 w-full" style={{ backgroundColor: 'var(--brand-surface-muted)' }} aria-hidden />
          </div>
        )}
        {msg && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>}
      </CardContent>
      </Card>

      {/* Anteprima pianificazione */}
      {idsAttivita.length === 0 ? (
        <Card animated={false}>
          <CardContent className="p-8 text-center">
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              Nessuna riga pianificabile per questa attività. Usa «Sincronizza file» per caricare i dati.
            </p>
          </CardContent>
        </Card>
      ) : (
        <AnteprimaPianificazione
          gruppi={gruppi}
          selezione={selezione}
          espansi={espansi}
          caricando={caricando}
          onToggleRiga={toggleRiga}
          onToggleOperatore={toggleOperatore}
          onToggleEspandi={toggleEspandi}
          onScarta={scarta}
          esitoPerOdl={esitoPerOdl}
          okIds={okIds}
        />
      )}

      {/* Barra azioni sticky */}
      {idsAttivita.length > 0 && (
        <>
          <div
            className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
            style={{ borderColor: 'var(--brand-primary-border)', backgroundColor: 'var(--brand-surface)', boxShadow: 'var(--shadow-md)' }}
          >
            <div className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              <span className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                {operatoriDaCreare.length} operatori · {selezione.size} interventi
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isLm && (
                <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--brand-text-main)' }}>
                  <input type="checkbox" checked={aceaDry} onChange={(e) => setAceaDry(e.target.checked)} /> Prova
                </label>
              )}
              <Button
                variant="soft"
                onClick={() => { setTerritorioSel(''); setTerritorioModale(true); }}
                disabled={procedendo || selezione.size === 0}
              >
                {procedendo ? 'Creo…' : 'Crea rapportini (app)'}
              </Button>
              {!isLm && (
                <Button
                  variant="primary"
                  onClick={() => void scriviAcea()}
                  disabled={aceaArming || selezione.size === 0}
                  className={selezione.size ? 'shadow-[var(--shadow-hover)]' : ''}
                >
                  {aceaArming ? 'Invio…' : aceaDry ? 'Assegna su ACEA (Prova)' : 'Assegna su ACEA'}
                </Button>
              )}
            </div>
          </div>
          {territorioModale && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => setTerritorioModale(false)}>
              <div
                className="w-full max-w-sm rounded-2xl border p-5"
                style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)' }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Territorio da associare</h3>
                <p className="mt-1 text-xs" style={{ color: 'var(--brand-text-muted)' }}>
                  Gli interventi selezionati ({operatoriDaCreare.length} operatori) vengono accorpati sotto questo territorio: un solo rapportino — e un solo link — per operatore.
                </p>
                <select
                  value={territorioSel}
                  onChange={(e) => setTerritorioSel(e.target.value)}
                  className="mt-3 w-full rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-main)' }}
                >
                  <option value="">Scegli territorio…</option>
                  {territori.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
                <div className="mt-4 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setTerritorioModale(false)}>Annulla</Button>
                  <Button variant="primary" size="sm" disabled={!territorioSel || procedendo} onClick={() => void procedi(territorioSel)}>
                    {procedendo ? 'Creo…' : 'Crea rapportini'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {esito && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{esito}</p>}
        </>
      )}

      {/* Storico assegnazioni (collassabile) */}
      <Card animated={false}>
        <CardContent className="space-y-3">
          <button
            type="button"
            onClick={() => setStoricoAperto((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <span className="text-xs" style={{ color: 'var(--brand-text-subtle)' }}>{storicoAperto ? '▾' : '▸'}</span>
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Storico assegnazioni</h2>
            {storico.length > 0 && <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>· {storico.length}</span>}
          </button>
          {/* avviso doppione — SOLO all'occorrenza: stai per creare per operatori GIÀ assegnati quel
              giorno (i conflitti per-operatore sono già segnalati nell'anteprima). */}
          {(() => {
            if (operatoriDaCreare.length === 0) return null;
            const nomiSelez = new Set(operatoriDaCreare.map((o) => o.nome));
            const delGiorno = storico.filter((s) => s.data_pianificata === dataSelez && s.staff_name != null && nomiSelez.has(s.staff_name));
            if (delGiorno.length === 0) return null;
            return (
              <div
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
              >
                ⚠️ Stai per creare rapportini per operatori già assegnati il {dataSelez}:{' '}
                {delGiorno.map((s) => `${s.staff_name ?? '—'} (${s.comune}, ${s.n_interventi})`).join(', ')}.
              </div>
            );
          })()}
          {storicoAperto && (
            storico.length === 0 ? (
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
                    {storico.map((s, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}>
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
            )
          )}
        </CardContent>
      </Card>

      {/* Barra "in attesa dell'agente" per l'assegnazione su ACEA (può durare a lungo → niente soglia di stallo) */}
      {!isLm && (
        <BarraAttesaAgente dispatchedAt={dispatchedAtAcea} fatto={fattoAcea} sogliaStalloMin={null} etichetta="Assegna su ACEA" />
      )}

      {/* Assegnazione ACEA: il trigger è nella barra azioni → qui solo gli ESITI (dunning) o la nota LM */}
      {isLm ? (
        <Card animated={false}>
          <CardContent className="space-y-1">
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
              Assegna su ACEA (WEB Appalti)
            </h2>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              L&rsquo;assegnazione automatica su ACEA per le Limitazioni Massive è in arrivo (Fase 2).
            </p>
          </CardContent>
        </Card>
      ) : (
        <PannelloAceaAssegna
          aperto={esitoAperto}
          onToggle={() => setEsitoAperto((v) => !v)}
          msg={aceaMsg}
          esiti={aceaEsiti}
          checking={aceaCheck}
          onRicarica={() => void caricaAceaEsiti(dataSelez)}
        />
      )}
    </div>
  );
}
