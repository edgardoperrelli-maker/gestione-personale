'use client';

import { useEffect, useState } from 'react';
import Input from '@/components/Input';
import Button from '@/components/Button';
import SquadraPicker from './SquadraPicker';
import AzioniForm from './AzioniForm';
import { voceEsitoColore } from '@/utils/rapportini/voceColore';
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

export default function OrdinePresenteForm({ boot, onDone }: { boot: Bootstrap; onDone: (msg: string) => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<InterventoAperto[]>([]);
  const [caricando, setCaricando] = useState(false);
  const [sel, setSel] = useState<Dettaglio | null>(null);
  const [rapIdEff, setRapIdEff] = useState('');
  const [esecutori, setEsecutori] = useState<string[]>([]);
  const [dataEsecuzione, setDataEsecuzione] = useState(oggi);
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCaricando(true);
    const url = `/api/admin/consuntivazione/aperti${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`;
    const t = setTimeout(() => {
      fetch(url)
        .then((r) => r.json())
        .then((j) => { if (vivo) setLista((j.interventi ?? []) as InterventoAperto[]); })
        .catch(() => { if (vivo) setLista([]); })
        .finally(() => { if (vivo) setCaricando(false); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);

  async function apri(id: string) {
    setErrore(null);
    const res = await fetch(`/api/admin/consuntivazione/aperti?id=${id}`);
    const j = await res.json();
    if (!res.ok) { setErrore(j.error === 'gia_esitato' ? 'Ordine già esitato.' : 'Impossibile caricare l\'ordine.'); return; }
    const d = j as Dettaglio;
    setSel(d);
    setRapIdEff(d.rapId || crypto.randomUUID());
    setRisposte(d.risposte ?? {});
    setEsecutori(d.intervento.staff_id ? [d.intervento.staff_id] : []);
    setDataEsecuzione(d.intervento.data || oggi());
  }

  const esito = sel && sel.campi.length ? voceEsitoColore(risposte, sel.campi) : 'neutro';
  const pronto = Boolean(sel && esecutori.length > 0 && dataEsecuzione && esito !== 'neutro');

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
      setLista((l) => l.filter((x) => x.id !== sel.intervento.id));
      onDone(j.annullato ? 'Ordine registrato come doppio positivo (annullato e messo in riconciliazione).' : 'Ordine consuntivato con successo.');
    } catch {
      setErrore('Errore di rete. Riprova.');
    } finally {
      setSalvando(false);
    }
  }

  const labelCls = 'mb-1 block text-xs font-medium text-[var(--brand-text-muted)]';

  if (sel) {
    const i = sel.intervento;
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setSel(null)}
          className="text-sm text-[var(--primary-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          ← Torna all&apos;elenco
        </button>

        <dl className="grid gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4 text-sm sm:grid-cols-3">
          <Info label="ODL" value={i.odl} />
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
          <Button variant="primary" onClick={submit} disabled={!pronto || salvando}>
            {salvando ? 'Esitazione…' : 'Esita ordine'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Cerca ordine aperto</label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ODL, matricola, indirizzo, nominativo o PDR…" />
      </div>

      {caricando ? (
        <ul className="space-y-2" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)]" />
          ))}
        </ul>
      ) : lista.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border-strong)] p-6 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun ordine aperto {q.trim() ? 'per la ricerca corrente' : 'negli ultimi 60 giorni'}.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--brand-border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--brand-border)]">
          {lista.map((it) => (
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
                <span className="shrink-0 text-xs text-[var(--brand-text-subtle)]">{it.data}</span>
              </button>
            </li>
          ))}
        </ul>
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
    default: return null;
  }
}
