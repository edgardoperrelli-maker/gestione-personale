'use client';

import { useMemo, useState } from 'react';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/Button';
import SquadraPicker from './SquadraPicker';
import AzioniForm from './AzioniForm';
import { esitabileConsuntivo } from '@/lib/consuntivazione/statoEsito';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { Bootstrap } from './ConsuntivazioneClient';

const oggi = () => new Date().toISOString().slice(0, 10);

type InterventoAperto = {
  id: string; committente: string | null; odl: string | null; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; comune: string | null; matricola_contatore: string | null; intervento_tipo: string | null;
  data: string; staff_id: string | null;
};
type Dettaglio = {
  intervento: InterventoAperto & { cap: string | null; fascia_oraria: string | null; territorio_id: string | null; gruppo_attivita: string | null };
  voceId: string | null;
  rapId: string | null;
  risposte: Record<string, unknown>;
  campi: TemplateCampo[];
};

type Filtri = {
  committente: string; gruppo: string; attivita: string; operatore: string;
  dal: string; al: string; odl: string; pdr: string; via: string;
};
const FILTRI_VUOTI: Filtri = { committente: '', gruppo: '', attivita: '', operatore: '', dal: '', al: '', odl: '', pdr: '', via: '' };

export default function OrdinePresenteForm({ boot, onDone }: { boot: Bootstrap; onDone: (msg: string) => void }) {
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI);
  const [risultati, setRisultati] = useState<InterventoAperto[] | null>(null); // null = non ancora cercato
  const [caricando, setCaricando] = useState(false);
  const [avviso, setAvviso] = useState<string | null>(null);
  const [sel, setSel] = useState<Dettaglio | null>(null);
  const [rapIdEff, setRapIdEff] = useState('');
  const [esecutori, setEsecutori] = useState<string[]>([]);
  const [dataEsecuzione, setDataEsecuzione] = useState(oggi);
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Cascata tassonomia: gruppi filtrati per committente, descrizioni per committente+gruppo.
  const gruppi = useMemo(() => {
    const src = filtri.committente ? boot.attivita.filter((a) => a.committente === filtri.committente) : boot.attivita;
    return [...new Set(src.map((a) => a.gruppo))].sort((a, b) => a.localeCompare(b, 'it'));
  }, [boot.attivita, filtri.committente]);
  const descrizioni = useMemo(() => {
    let src = boot.attivita;
    if (filtri.committente) src = src.filter((a) => a.committente === filtri.committente);
    if (filtri.gruppo) src = src.filter((a) => a.gruppo === filtri.gruppo);
    return [...new Set(src.map((a) => a.descrizione))].sort((a, b) => a.localeCompare(b, 'it'));
  }, [boot.attivita, filtri.committente, filtri.gruppo]);

  const hasFiltro = Object.values(filtri).some(Boolean);

  const upd = (patch: Partial<Filtri>) => setFiltri((f) => ({ ...f, ...patch }));

  async function cerca() {
    if (!hasFiltro) { setAvviso('Imposta almeno un filtro per cercare.'); setRisultati(null); return; }
    setAvviso(null); setCaricando(true);
    const params = new URLSearchParams();
    (Object.entries(filtri) as [keyof Filtri, string][]).forEach(([k, v]) => { if (v) params.set(k, v); });
    try {
      const res = await fetch(`/api/admin/consuntivazione/aperti?${params.toString()}`);
      const j = await res.json();
      setRisultati((j.interventi ?? []) as InterventoAperto[]);
    } catch {
      setRisultati([]);
    } finally {
      setCaricando(false);
    }
  }

  function azzera() {
    setFiltri(FILTRI_VUOTI); setRisultati(null); setAvviso(null);
  }

  function esporta() {
    const params = new URLSearchParams();
    (Object.entries(filtri) as [keyof Filtri, string][]).forEach(([k, v]) => { if (v) params.set(k, v); });
    // Navigazione diretta: il GET (cookie di sessione) risponde con l'Excel (Content-Disposition).
    window.location.href = `/api/admin/consuntivazione/aperti/export?${params.toString()}`;
  }

  async function apri(id: string) {
    setErrore(null);
    const res = await fetch(`/api/admin/consuntivazione/aperti?id=${id}`);
    const j = await res.json();
    if (!res.ok) { setErrore(j.error === 'gia_esitato' ? 'Ordine già esitato.' : "Impossibile caricare l'ordine."); return; }
    const d = j as Dettaglio;
    setSel(d);
    setRapIdEff(d.rapId || crypto.randomUUID());
    setRisposte(d.risposte ?? {});
    setEsecutori(d.intervento.staff_id ? [d.intervento.staff_id] : []);
    setDataEsecuzione(d.intervento.data || oggi());
  }

  const esitabile = Boolean(sel && sel.campi.length > 0 && esitabileConsuntivo(risposte, sel.campi));
  const pronto = Boolean(sel && esecutori.length > 0 && dataEsecuzione && esitabile);

  async function submit() {
    if (!sel) return;
    setSalvando(true); setErrore(null);
    try {
      const res = await fetch('/api/admin/consuntivazione/esita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interventoId: sel.intervento.id,
          risposte,
          esecutori: esecutori.map((staff_id) => ({ staff_id })),
          dataEsecuzione,
          rapId: rapIdEff,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErrore(j.messaggio || messaggioErrore(j.error) || 'Errore imprevisto.'); return; }
      setSel(null); setRisposte({}); setEsecutori([]);
      setRisultati((l) => (l ? l.filter((x) => x.id !== sel.intervento.id) : l));
      onDone(j.annullato ? 'Ordine registrato come doppio positivo (annullato e messo in riconciliazione).' : 'Ordine consuntivato con successo.');
    } catch {
      setErrore('Errore di rete. Riprova.');
    } finally {
      setSalvando(false);
    }
  }

  const labelCls = 'mb-1 block text-xs font-medium text-[var(--brand-text-muted)]';

  // ── Vista dettaglio (ordine selezionato) ─────────────────────────────────────
  if (sel) {
    const i = sel.intervento;
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSel(null)}
          className="text-sm text-[var(--primary-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          ← Torna ai risultati
        </button>

        <dl className="grid gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4 text-sm sm:grid-cols-3">
          <Info label="ODL / ODS" value={i.odl} />
          <Info label="Attività" value={i.intervento_tipo} />
          <Info label="Matricola" value={i.matricola_contatore} />
          <Info label="PDR" value={i.pdr} />
          <Info label="Nominativo" value={i.nominativo} />
          <Info label="Indirizzo" value={[i.indirizzo, i.comune].filter(Boolean).join(', ') || null} />
        </dl>

        <SquadraPicker operatori={boot.operatori} valori={esecutori} onChange={setEsecutori} disabilitato={salvando} />

        <div className="max-w-[220px]">
          <label className={labelCls}>Data esecuzione</label>
          <Input type="date" value={dataEsecuzione} onChange={(e) => setDataEsecuzione(e.target.value)} />
        </div>

        {sel.campi.length > 0 ? (
          <AzioniForm campi={sel.campi} risposte={risposte} onChange={setRisposte} rapId={rapIdEff} disabilitato={salvando} />
        ) : (
          <p className="text-sm text-[var(--status-warn)]">Nessun flusso attivo per questa attività.</p>
        )}

        {errore && <p className="text-sm text-[var(--status-ko)]">{errore}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-[var(--brand-border)] pt-4">
          <Button variant="ghost" onClick={() => setSel(null)} disabled={salvando}>Annulla</Button>
          <Button variant="primary" onClick={submit} loading={salvando} disabled={!pronto}>
            {salvando ? 'Esitazione…' : 'Esita ordine'}
          </Button>
        </div>
      </div>
    );
  }

  // ── Vista ricerca (filtri + risultati) ───────────────────────────────────────
  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => { e.preventDefault(); void cerca(); }}
        className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)]/60 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Committente</label>
            <Select value={filtri.committente} onChange={(e) => upd({ committente: e.target.value, gruppo: '', attivita: '' })}>
              <option value="">Tutti</option>
              {boot.committenti.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Gruppo attività</label>
            <Select value={filtri.gruppo} onChange={(e) => upd({ gruppo: e.target.value, attivita: '' })}>
              <option value="">Tutti</option>
              {gruppi.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Descrizione attività</label>
            <Select value={filtri.attivita} onChange={(e) => upd({ attivita: e.target.value })}>
              <option value="">Tutte</option>
              {descrizioni.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Operatore</label>
            <Select value={filtri.operatore} onChange={(e) => upd({ operatore: e.target.value })}>
              <option value="">Tutti</option>
              {boot.operatori.map((o) => <option key={o.staffId} value={o.staffId}>{o.nome}</option>)}
            </Select>
          </div>
          <div>
            <label className={labelCls}>Dal</label>
            <Input type="date" value={filtri.dal} onChange={(e) => upd({ dal: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Al</label>
            <Input type="date" value={filtri.al} onChange={(e) => upd({ al: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>ODL / ODS</label>
            <Input value={filtri.odl} onChange={(e) => upd({ odl: e.target.value })} placeholder="Numero ordine…" />
          </div>
          <div>
            <label className={labelCls}>PDR / impianto</label>
            <Input value={filtri.pdr} onChange={(e) => upd({ pdr: e.target.value })} placeholder="Codice PDR / impianto…" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Via</label>
            <Input value={filtri.via} onChange={(e) => upd({ via: e.target.value })} placeholder="Indirizzo…" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--brand-text-subtle)]">
            Imposta uno o più filtri e premi Cerca.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={azzera} disabled={caricando}>Azzera filtri</Button>
            <Button type="submit" variant="primary" loading={caricando} disabled={!hasFiltro}>
              {caricando ? 'Ricerca…' : 'Cerca'}
            </Button>
          </div>
        </div>
        {avviso && <p className="text-xs text-[var(--status-warn)]">{avviso}</p>}
      </form>

      {caricando ? (
        <ul className="space-y-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)]" />
          ))}
        </ul>
      ) : risultati === null ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Cerca un ordine da esitare usando i filtri qui sopra.
        </p>
      ) : risultati.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun ordine aperto per i filtri impostati.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--brand-text-subtle)]">
              {risultati.length} ordini aperti trovati{risultati.length === 200 ? ' (mostrati i primi 200; l’export li include tutti)' : ''}.
            </p>
            <Button type="button" variant="outline" onClick={esporta}>Esporta Excel</Button>
          </div>
          <ul className="divide-y divide-[var(--brand-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)]">
            {risultati.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => apri(it.id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[var(--brand-surface-muted)] focus:outline-none focus-visible:bg-[var(--brand-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--brand-text-main)]">
                      {it.intervento_tipo || 'Intervento'} · {it.odl || 's/ODL'}
                    </span>
                    <span className="block truncate text-xs text-[var(--brand-text-muted)]">
                      {[it.indirizzo, it.comune].filter(Boolean).join(', ') || it.nominativo || '—'}
                      {it.matricola_contatore ? ` · matr. ${it.matricola_contatore}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--brand-text-subtle)]">{it.data}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {errore && <p className="text-sm text-[var(--status-ko)]">{errore}</p>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-[var(--brand-text-subtle)]">{label}</dt>
      <dd className="text-[var(--brand-text-main)]">{value || '—'}</dd>
    </div>
  );
}

function messaggioErrore(code: string | undefined): string | null {
  switch (code) {
    case 'esecutori_mancanti': return 'Seleziona almeno un operatore.';
    case 'foto_mancanti': return 'Mancano delle foto obbligatorie.';
    case 'gia_esitato': return 'Ordine già esitato.';
    case 'nessun_flusso': return 'Nessun flusso attivo per il gruppo attività.';
    case 'esito_mancante': return 'Seleziona un esito (positivo o negativo) per esitare.';
    case 'nota_negativo': return "Per l'esito negativo inserisci la nota col motivo.";
    default: return null;
  }
}
