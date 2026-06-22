'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { NavState } from '@/lib/agente/aceaNav';
import type { GruppoOperatore } from '@/lib/agente/costruisciAnteprima';
import type { RigaPianificabile, FileConfig, AceaEsiti, StoricoRiga } from '../tipi';
import { AnteprimaPianificazione, righeLibere } from '../AnteprimaPianificazione';
import { PannelloAceaAssegna } from '../PannelloAceaAssegna';
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

  // territorio macro (ACEA, LAZIO CENTRO, …) scelto al "Crea rapportini"
  const [territori, setTerritori] = useState<Array<{ id: string; name: string }>>([]);
  const [territorioModale, setTerritorioModale] = useState(false);
  const [territorioSel, setTerritorioSel] = useState('');

  // ACEA
  const [aceaDry, setAceaDry] = useState(true);
  const [aceaArming, setAceaArming] = useState(false);
  const [aceaMsg, setAceaMsg] = useState<string | null>(null);
  const [aceaEsiti, setAceaEsiti] = useState<AceaEsiti | null>(null);
  const [aceaCheck, setAceaCheck] = useState(false);

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

  // ODL del giorno selezionato per il pannello ACEA (conta solo per dunning)
  const odlAceaPerData = righeAttivita.filter((r) => r.data === data).length;

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
            ? `Attenzione: richiesta inviata per il ${data}, ma per quel giorno NON risultano ODL letti: l'agente non avrà nulla da assegnare. Leggi prima dal file o cambia giorno.`
            : `Richiesta inviata (${aceaDry ? 'PROVA' : 'REALE'}) per il ${data} (${odlAceaPerData} ODL): l'agente assegnerà al prossimo contatto (~1 min). L'esito comparirà qui sotto.`,
        );
        for (const ms of [15000, 35000, 60000, 90000]) setTimeout(() => void caricaAceaEsiti(data), ms);
      } else setAceaMsg(`Errore: ${(j as { error?: string }).error ?? res.status}`);
    } catch (e) {
      setAceaMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally { setAceaArming(false); }
  }

  async function scarta(o: GruppoOperatore) {
    if (!window.confirm(`Rimuovere ${o.nome} dall'anteprima? Le sue ${o.righe.length} righe NON verranno pianificate (potrai ricaricarle con "Sincronizza file").`)) return;
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

  // ── Effetti ───────────────────────────────────────────────────────────────

  useEffect(() => {
    void caricaAnteprima(idsAttivitaKey ? idsAttivitaKey.split(',') : []);
  }, [idsAttivitaKey, caricaAnteprima]);

  useEffect(() => {
    if (!isLm) void caricaAceaEsiti(data);
  }, [isLm, data, caricaAceaEsiti]);

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

  // Raggruppamento per TERRITORIO (scelto al "Crea rapportini"): un rapportino per
  // operatore, i comuni vengono accorpati → niente più conteggio per-comune.
  const operatoriDaCreare = gruppi.filter((o) => righeLibere(o).some((id) => selezione.has(id)));

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
            className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
          >
            <span>In attesa di lettura per il giorno {pianificaData}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.refresh()}
              className="ml-auto"
            >
              ↻ Aggiorna
            </Button>
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
              {' '}→ un rapportino per operatore (indirizzi accorpati nel territorio scelto)
            </div>
            <Button
              variant="primary"
              onClick={() => { setTerritorioSel(''); setTerritorioModale(true); }}
              disabled={procedendo || selezione.size === 0}
              className={selezione.size ? 'shadow-[var(--shadow-hover)]' : ''}
            >
              {procedendo ? 'Creo…' : 'Crea rapportini (app)'}
            </Button>
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

      {/* Storico assegnazioni */}
      <Card animated={false}>
        <CardContent className="space-y-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
            Storico assegnazioni
          </h2>
          {(() => {
            const delGiorno = storico.filter((s) => s.data_pianificata === data);
            if (delGiorno.length === 0) return null;
            return (
              <div
                className="rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--warning)', backgroundColor: 'var(--warning-soft)', color: 'var(--brand-text-main)' }}
              >
                ⚠️ Il giorno {data} risulta già assegnato:{' '}
                {delGiorno.map((s) => `${s.staff_name ?? '—'} (${s.comune}, ${s.n_interventi})`).join(', ')}.
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
          )}
        </CardContent>
      </Card>

      {/* Pannello ACEA: attivo per dunning, disabilitato per lm */}
      {isLm ? (
        <Card animated={false}>
          <CardContent className="space-y-2">
            <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
              Assegna su ACEA (WEB Appalti)
            </h2>
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
              L&rsquo;assegnazione automatica su ACEA per le Limitazioni Massive è in arrivo (Fase 2).
            </p>
            <Button variant="ghost" size="sm" disabled>
              Assegna su ACEA — in arrivo (Fase 2)
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PannelloAceaAssegna
          data={data}
          odlCount={odlAceaPerData}
          aceaDry={aceaDry}
          onToggleDry={setAceaDry}
          onScrivi={() => void scriviAcea()}
          arming={aceaArming}
          msg={aceaMsg}
          esiti={aceaEsiti}
          checking={aceaCheck}
          onRicarica={() => void caricaAceaEsiti(data)}
        />
      )}
    </div>
  );
}
