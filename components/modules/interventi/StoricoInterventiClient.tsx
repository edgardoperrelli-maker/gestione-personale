// components/modules/interventi/StoricoInterventiClient.tsx
'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import Link from 'next/link';
import Breadcrumb from '@/components/ui/Breadcrumb';
import Button from '@/components/Button';
import { DetailDrawer, DrawerKv, DrawerSection } from '@/components/ui/DetailDrawer';
import { useCallback, useEffect, useRef, useState } from 'react';
import StoricoFiltri, { type StatoFiltriUI } from './StoricoFiltri';
import StoricoTabella from './StoricoTabella';
import ModaleFotoVoce from './ModaleFotoVoce';
import ModaleModificaVoce from './ModaleModificaVoce';
import type { RigaStorico, ContatoriStorico } from '@/lib/interventi/storico/types';

type Staff = { id: string; display_name: string };

const FILTRI_VUOTI: StatoFiltriUI = {
  q: '', dal: '', al: '', esecutori: [], comune: '', gruppi: [], committenti: [], territori: [],
  eseguito: '', sostValvola: '', miniBag: '', rgStop: '',
};

const CONTATORI_ZERO: ContatoriStorico = {
  totale: 0, esitati: 0, eseguiti: 0, negativi: 0, sostValvola: 0, miniBag: 0, rgStop: 0,
};

/** Colore della barra cockpit a sinistra di ogni card-filtro. */
const CARD_BAR: Record<string, string> = {
  esitati: 'var(--brand-primary)', eseguiti: 'var(--status-ok)', negativi: 'var(--status-ko)',
  sostValvola: 'var(--brand-primary)', miniBag: 'var(--brand-primary)', rgStop: 'var(--brand-primary)',
};

const CARDS: { key: keyof ContatoriStorico; label: string; tone?: 'ok' | 'no' }[] = [
  { key: 'esitati', label: 'Interventi esitati' },
  { key: 'eseguiti', label: 'Eseguiti', tone: 'ok' },
  { key: 'negativi', label: 'Negativi', tone: 'no' },
  { key: 'sostValvola', label: 'Sost. valvola' },
  { key: 'miniBag', label: 'Mini bag' },
  { key: 'rgStop', label: 'RG stop' },
];

/** Querystring dei filtri (senza `page`), condivisa da lista ed export.
 * I filtri multi viaggiano come parametro ripetuto (?esecutore=a&esecutore=b). */
function filtriToParams(f: StatoFiltriUI): URLSearchParams {
  const params = new URLSearchParams();
  if (f.q.trim()) {
    params.set('q', f.q.trim());
  } else {
    if (f.dal) params.set('dal', f.dal);
    if (f.al) params.set('al', f.al);
  }
  for (const id of f.esecutori) params.append('esecutore', id);
  for (const g of f.gruppi) params.append('gruppo', g);
  for (const c of f.committenti) params.append('committente', c);
  for (const t of f.territori) params.append('territorio', t);
  if (f.comune.trim()) params.set('comune', f.comune.trim());
  if (f.eseguito) params.set('eseguito', f.eseguito);
  if (f.sostValvola) params.set('sostValvola', f.sostValvola);
  if (f.miniBag) params.set('miniBag', f.miniBag);
  if (f.rgStop) params.set('rgStop', f.rgStop);
  return params;
}

export default function StoricoInterventiClient({ staff, gruppi, territori, isAdminPlus, puoModificare }: { staff: Staff[]; gruppi: string[]; territori: string[]; isAdminPlus: boolean; puoModificare: boolean }) {
  const [filtri, setFiltri] = useState<StatoFiltriUI>(FILTRI_VUOTI);
  const [fotoVoceId, setFotoVoceId] = useState<string | null>(null);
  const [modificaVoceId, setModificaVoceId] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<RigaStorico | null>(null);
  const [righe, setRighe] = useState<RigaStorico[]>([]);
  const [total, setTotal] = useState(0);
  const [troncato, setTroncato] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [contatori, setContatori] = useState<ContatoriStorico>(CONTATORI_ZERO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const carica = useCallback(async (f: StatoFiltriUI, p: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = filtriToParams(f);
      params.set('page', String(p));

      const res = await fetch(`/api/interventi/storico?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore caricamento.');
      }
      const data = (await res.json()) as {
        righe: RigaStorico[]; total: number; troncato: boolean; pageSize: number; contatori?: ContatoriStorico;
      };
      setRighe(Array.isArray(data.righe) ? data.righe : []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
      setTroncato(Boolean(data.troncato));
      setPageSize(typeof data.pageSize === 'number' ? data.pageSize : 100);
      setContatori(data.contatori ?? CONTATORI_ZERO);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // richiesta annullata: ignora
      setError(e instanceof Error ? e.message : 'Errore caricamento.');
      setRighe([]);
      setTotal(0);
      setTroncato(false);
      setContatori(CONTATORI_ZERO);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  }, []);

  // Caricamento iniziale: nessun filtro → intero DB (paginato).
  useEffect(() => {
    void carica(FILTRI_VUOTI, 0);
  }, [carica]);

  // Debounce sulla ricerca testuale (parte da sola).
  const primaVolta = useRef(true);
  useEffect(() => {
    if (primaVolta.current) {
      primaVolta.current = false;
      return;
    }
    const t = setTimeout(() => {
      setPage(0);
      void carica(filtri, 0);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtri.q]);

  const applica = () => { setPage(0); void carica(filtri, 0); };
  const pulisci = () => { setFiltri(FILTRI_VUOTI); setPage(0); void carica(FILTRI_VUOTI, 0); };
  const vaiPagina = (p: number) => { setPage(p); void carica(filtri, p); };
  const esporta = () => {
    window.location.href = `/api/interventi/storico/export?${filtriToParams(filtri).toString()}`;
  };
  const cancella = async (voceId: string) => {
    if (!(await chiediConferma({ title: 'Eliminare definitivamente questa riga?', message: 'Intervento, eventuali foto e richiesta collegata verranno rimossi. Operazione non reversibile.', confirmLabel: 'Elimina', danger: true }))) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Errore eliminazione.');
      }
      void carica(filtri, page);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione.');
    }
  };

  // Applica un patch ai filtri e ricarica (usato dalle card-filtro rapide).
  const applicaPatch = (patch: Partial<StatoFiltriUI>) => {
    const next = { ...filtri, ...patch };
    setFiltri(next);
    setPage(0);
    void carica(next, 0);
  };
  // Stato "attivo" della card in base al filtro corrispondente.
  const cardAttiva = (key: keyof ContatoriStorico): boolean => {
    switch (key) {
      case 'eseguiti':    return filtri.eseguito === 'SI';
      case 'negativi':    return filtri.eseguito === 'NO';
      case 'sostValvola': return filtri.sostValvola === 'SI';
      case 'miniBag':     return filtri.miniBag === 'SI';
      case 'rgStop':      return filtri.rgStop === 'SI';
      case 'esitati':     return filtri.eseguito === '';
      default:            return false;
    }
  };
  // Click su una card → imposta/azzera (toggle) il filtro corrispondente e ricarica.
  const onCardClick = (key: keyof ContatoriStorico) => {
    switch (key) {
      case 'esitati':     return applicaPatch({ eseguito: '' });
      case 'eseguiti':    return applicaPatch({ eseguito: filtri.eseguito === 'SI' ? '' : 'SI' });
      case 'negativi':    return applicaPatch({ eseguito: filtri.eseguito === 'NO' ? '' : 'NO' });
      case 'sostValvola': return applicaPatch({ sostValvola: filtri.sostValvola === 'SI' ? '' : 'SI' });
      case 'miniBag':     return applicaPatch({ miniBag: filtri.miniBag === 'SI' ? '' : 'SI' });
      case 'rgStop':      return applicaPatch({ rgStop: filtri.rgStop === 'SI' ? '' : 'SI' });
    }
  };

  const totPagine = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      {/* Header slim (pattern fogliette §7bis, variante densa): breadcrumb + vista gemella */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <Breadcrumb items={[{ label: 'Interventi' }, { label: 'Storico' }]} />
        <Link
          href="/hub/interventi/riconsegna"
          className="rounded-[var(--radius-sm)] text-sm font-medium text-[var(--primary-text)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          Riconsegna giornaliera →
        </Link>
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {CARDS.map((c) => {
          const active = cardAttiva(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onCardClick(c.key)}
              aria-pressed={active}
              title={`Filtra: ${c.label}`}
              className={`relative flex flex-col items-start overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--brand-surface)] px-3.5 py-2 text-left shadow-[var(--shadow-sm)] transition-colors ${
                active
                  ? 'border-[var(--brand-primary)] ring-1 ring-[var(--brand-primary)]'
                  : 'border-[var(--brand-border)] hover:border-[var(--brand-text-muted)]'
              }`}
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: CARD_BAR[c.key] }} aria-hidden />
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--brand-text-muted)]">{c.label}</span>
              <span
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  c.tone === 'ok' ? 'text-[var(--status-ok)]' : c.tone === 'no' ? 'text-[var(--status-ko)]' : 'text-[var(--brand-text-main)]'
                }`}
              >
                {contatori[c.key].toLocaleString('it-IT')}
              </span>
            </button>
          );
        })}
      </div>

      <StoricoFiltri
        filtri={filtri}
        setFiltri={setFiltri}
        staff={staff}
        gruppi={gruppi}
        territori={territori}
        onApplica={applica}
        onPulisci={pulisci}
        onEsporta={esporta}
        loading={loading}
      />

      {troncato && (
        <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning)]">
          Troppi risultati: i contatori e la tabella mostrano i primi {total}. Restringi i filtri.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {/* Split cockpit: tabella + drawer di dettaglio (drawer solo da xl in su) */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="relative min-h-0 flex-1 overflow-auto rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)]">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-[var(--brand-surface)]/70 text-sm text-[var(--brand-text-muted)]">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
              Caricamento…
            </div>
          )}
          <StoricoTabella
            righe={righe}
            isAdminPlus={isAdminPlus}
            puoModificare={puoModificare}
            onFoto={(id) => setFotoVoceId(id)}
            onModifica={(id) => setModificaVoceId(id)}
            onCancella={cancella}
            onRiga={(r) => setDettaglio((cur) => (cur?.id === r.id ? null : r))}
            rigaSelezionata={dettaglio?.id ?? null}
          />
        </div>

        {dettaglio && (
          <DetailDrawer
            className="hidden w-[360px] shrink-0 xl:flex"
            eyebrow={`ODL ${dettaglio.odl ?? '—'}${dettaglio.committente ? ` · ${dettaglio.committente.toUpperCase()}` : ''}`}
            title={dettaglio.via ?? 'Senza indirizzo'}
            meta={
              <span className="flex flex-wrap items-center gap-1.5">
                {([['Eseguito', dettaglio.eseguito], ['Sost. valvola', dettaglio.sostValvola], ['Mini bag', dettaglio.miniBag], ['RG stop', dettaglio.rgStop]] as const)
                  .filter(([, v]) => v === 'SI' || v === 'NO')
                  .map(([lbl, v]) => (
                    <span
                      key={lbl}
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                      style={{
                        color: v === 'SI' ? 'var(--status-ok)' : 'var(--status-ko)',
                        backgroundColor: v === 'SI' ? 'var(--status-ok-soft)' : 'var(--status-ko-soft)',
                      }}
                    >
                      {lbl}: {v}
                    </span>
                  ))}
              </span>
            }
            onClose={() => setDettaglio(null)}
            footer={
              <>
                <Button size="sm" className="flex-1" onClick={() => setFotoVoceId(dettaglio.id)}>Vedi foto</Button>
                {puoModificare && (
                  <Button size="sm" variant="primary" className="flex-1" onClick={() => setModificaVoceId(dettaglio.id)}>Modifica</Button>
                )}
              </>
            }
          >
            <DrawerSection title="Anagrafica">
              <DrawerKv
                rows={[
                  { k: 'Data', v: dettaglio.data ? dettaglio.data.split('-').reverse().join('/') : '—', mono: true },
                  { k: 'Esecutore', v: dettaglio.esecutore ?? '—' },
                  { k: 'PDR', v: dettaglio.pdr ?? '—', mono: true },
                  { k: 'Matricola', v: dettaglio.matricola ?? '—', mono: true },
                  { k: 'Sigillo', v: dettaglio.sigillo ?? '—', mono: true },
                  { k: 'Attività', v: dettaglio.gruppoAttivita ?? '—' },
                  { k: 'Gruppo', v: dettaglio.gruppo ?? '—' },
                  { k: 'Territorio', v: dettaglio.territorio ?? '—' },
                ]}
              />
            </DrawerSection>
            {dettaglio.note && (
              <DrawerSection title="Note">
                <p className="whitespace-pre-wrap text-[12.5px] text-[var(--brand-text-muted)]">{dettaglio.note}</p>
              </DrawerSection>
            )}
          </DetailDrawer>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 text-sm text-[var(--brand-text-muted)]">
        <span>{total.toLocaleString('it-IT')} righe</span>
        {totPagine > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Pagina precedente"
              onClick={() => vaiPagina(Math.max(0, page - 1))}
              disabled={loading || page === 0}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              ←
            </button>
            <span>Pagina {page + 1} di {totPagine}</span>
            <button
              type="button"
              aria-label="Pagina successiva"
              onClick={() => vaiPagina(Math.min(totPagine - 1, page + 1))}
              disabled={loading || page >= totPagine - 1}
              className="rounded-lg border border-[var(--brand-border)] px-3 py-1 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
            >
              →
            </button>
          </div>
        )}
      </div>

      {fotoVoceId && <ModaleFotoVoce voceId={fotoVoceId} puoCaricare={puoModificare} onClose={() => setFotoVoceId(null)} />}
      {puoModificare && modificaVoceId && (
        <ModaleModificaVoce
          voceId={modificaVoceId}
          onClose={() => setModificaVoceId(null)}
          onSaved={() => { void carica(filtri, page); }}
        />
      )}
    </div>
  );
}
