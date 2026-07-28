'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Filter, X } from 'lucide-react';
import Button from '@/components/Button';
import Tooltip from '@/components/ui/Tooltip';
import type { FiltroColonna as DefFiltro } from '@/lib/acea/colonneTabella';
import {
  ETICHETTE_PIANIFICAZIONE,
  type FiltriUI, type PianificazioneFiltro, type ScadenzaFiltro,
} from '@/lib/acea/filtriOrdini';

const PIANIFICAZIONI: PianificazioneFiltro[] = ['tutte', 'non_pianificati', 'pianificati'];

const LARGHEZZA = 264;
/** Margine dal bordo del viewport quando il pannello finisce fuori a destra. */
const MARGINE = 8;

const SCADENZE: Array<{ v: ScadenzaFiltro; etichetta: string }> = [
  { v: 'tutte', etichetta: 'Qualsiasi scadenza' },
  { v: 'scaduti', etichetta: 'Oltre la scadenza' },
  { v: 'in_scadenza', etichetta: 'In scadenza (7 gg)' },
  { v: 'senza_scadenza', etichetta: 'Senza scadenza' },
];

type Props = {
  intestazione: string;
  filtro: DefFiltro;
  filtri: FiltriUI;
  onChange: (f: FiltriUI) => void;
  /** Valori distinti dell'intero registro per i filtri a elenco. */
  valori: string[];
};

/** `true` se questa colonna sta filtrando qualcosa. */
export function colonnaFiltra(filtro: DefFiltro, f: FiltriUI): boolean {
  if (filtro.tipo === 'elenco') return f.elenchi[filtro.campo].length > 0;
  if (filtro.tipo === 'testo') return f.testi[filtro.campo].trim() !== '';
  if (filtro.tipo === 'esecutore') {
    return f.pianificazione.esecutori.length > 0 || f.pianificazione.senzaEsecutore;
  }
  if (filtro.tipo === 'data_pianificata') {
    return f.pianificazione.pianificazione !== 'tutte' || f.pianificazione.giorno !== null;
  }
  return f.scadenza !== 'tutte';
}

/**
 * Filtro nell'intestazione di colonna — l'AutoFiltro di Excel.
 *
 * **In portale, non in posizione assoluta**: il contenitore della tabella è `overflow-hidden` (con
 * lo scroller dentro), quindi un pannello assoluto verrebbe tagliato dal bordo. Si disegna su
 * `document.body` in `position: fixed`, calcolando la posizione dal rettangolo del pulsante.
 *
 * **Si applica alla conferma, non alla spunta.** Ogni spunta è una query al server: applicarle una
 * per una, su un comune spuntato per sbaglio in una lista di sessanta, significherebbe una raffica
 * di richieste e una tabella che salta sotto le mani. Si lavora su una bozza e si conferma —
 * com'è in Excel. `Esc` chiude senza applicare, `Invio` applica.
 */
export default function FiltroColonna({ intestazione, filtro, filtri, onChange, valori }: Props) {
  const [aperto, setAperto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const bottone = useRef<HTMLButtonElement>(null);
  const pannello = useRef<HTMLDivElement>(null);
  const idPannello = useId();

  // Bozza: modifiche in sospeso finché non si conferma.
  const [spunte, setSpunte] = useState<Set<string>>(new Set());
  const [testo, setTesto] = useState('');
  const [scadenza, setScadenza] = useState<ScadenzaFiltro>('tutte');
  const [cercaValore, setCercaValore] = useState('');
  const [senzaEsec, setSenzaEsec] = useState(false);
  const [pian, setPian] = useState<PianificazioneFiltro>('tutte');
  const [giorno, setGiorno] = useState('');

  const attivo = colonnaFiltra(filtro, filtri);

  const apri = useCallback(() => {
    if (filtro.tipo === 'elenco') setSpunte(new Set(filtri.elenchi[filtro.campo]));
    if (filtro.tipo === 'testo') setTesto(filtri.testi[filtro.campo]);
    if (filtro.tipo === 'scadenza') setScadenza(filtri.scadenza);
    if (filtro.tipo === 'esecutore') {
      setSpunte(new Set(filtri.pianificazione.esecutori));
      setSenzaEsec(filtri.pianificazione.senzaEsecutore);
    }
    if (filtro.tipo === 'data_pianificata') {
      setPian(filtri.pianificazione.pianificazione);
      setGiorno(filtri.pianificazione.giorno ?? '');
    }
    setCercaValore('');
    setAperto(true);
  }, [filtro, filtri]);

  const chiudi = useCallback(() => {
    setAperto(false);
    bottone.current?.focus();
  }, []);

  // Posizione calcolata dal rettangolo del pulsante, rientrata se sborda a destra.
  useLayoutEffect(() => {
    if (!aperto) { setPos(null); return; }
    const r = bottone.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(MARGINE, Math.min(r.left, window.innerWidth - LARGHEZZA - MARGINE));
    setPos({ top: r.bottom + 4, left });
  }, [aperto]);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pannello.current?.contains(t) && !bottone.current?.contains(t)) setAperto(false);
    };
    const tasto = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); chiudi(); } };
    // In cattura: lo scroll che conta è quello del contenitore della tabella, non quello di window.
    // Il pannello è ancorato a un rettangolo che scorrendo non vale più, quindi si chiude.
    const scorre = () => setAperto(false);
    document.addEventListener('mousedown', fuori);
    document.addEventListener('keydown', tasto);
    window.addEventListener('scroll', scorre, true);
    window.addEventListener('resize', scorre);
    return () => {
      document.removeEventListener('mousedown', fuori);
      document.removeEventListener('keydown', tasto);
      window.removeEventListener('scroll', scorre, true);
      window.removeEventListener('resize', scorre);
    };
  }, [aperto, chiudi]);

  const visibili = useMemo(() => {
    const q = cercaValore.trim().toLowerCase();
    return q === '' ? valori : valori.filter((v) => v.toLowerCase().includes(q));
  }, [valori, cercaValore]);

  const bozza = useCallback((): FiltriUI => ({
    ...filtri,
    elenchi: { ...filtri.elenchi },
    testi: { ...filtri.testi },
    pianificazione: { ...filtri.pianificazione },
  }), [filtri]);

  const applica = useCallback(() => {
    const agg = bozza();
    if (filtro.tipo === 'elenco') agg.elenchi[filtro.campo] = [...spunte];
    if (filtro.tipo === 'testo') agg.testi[filtro.campo] = testo;
    if (filtro.tipo === 'scadenza') agg.scadenza = scadenza;
    if (filtro.tipo === 'esecutore') {
      agg.pianificazione.esecutori = [...spunte];
      agg.pianificazione.senzaEsecutore = senzaEsec;
    }
    if (filtro.tipo === 'data_pianificata') {
      agg.pianificazione.pianificazione = pian;
      // Un giorno preciso non ha senso su «non pianificati»: la combinazione non tornerebbe mai
      // nulla, e chi la imposta crede di aver ristretto, non di aver svuotato.
      agg.pianificazione.giorno = pian === 'non_pianificati' || giorno === '' ? null : giorno;
    }
    onChange(agg);
    chiudi();
  }, [bozza, filtro, spunte, testo, scadenza, senzaEsec, pian, giorno, onChange, chiudi]);

  const azzera = useCallback(() => {
    const agg = bozza();
    if (filtro.tipo === 'elenco') agg.elenchi[filtro.campo] = [];
    if (filtro.tipo === 'testo') agg.testi[filtro.campo] = '';
    if (filtro.tipo === 'scadenza') agg.scadenza = 'tutte';
    if (filtro.tipo === 'esecutore') {
      agg.pianificazione.esecutori = [];
      agg.pianificazione.senzaEsecutore = false;
    }
    if (filtro.tipo === 'data_pianificata') {
      agg.pianificazione.pianificazione = 'tutte';
      agg.pianificazione.giorno = null;
    }
    onChange(agg);
    chiudi();
  }, [bozza, filtro, onChange, chiudi]);

  const scambia = (v: string) => {
    setSpunte((prec) => {
      const agg = new Set(prec);
      if (agg.has(v)) agg.delete(v); else agg.add(v);
      return agg;
    });
  };

  const contenuto = (
    <div
      ref={pannello}
      id={idPannello}
      role="dialog"
      aria-label={`Filtro ${intestazione}`}
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width: LARGHEZZA }}
      className="z-50 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-2 shadow-[var(--shadow-md)]"
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applica(); } }}
    >
      <p className="px-1 pb-1.5 text-xs font-semibold text-[var(--brand-text-main)]">{intestazione}</p>

      {filtro.tipo === 'elenco' && (
        <>
          <input
            autoFocus
            type="search"
            value={cercaValore}
            onChange={(e) => setCercaValore(e.target.value)}
            placeholder="Cerca nei valori"
            aria-label={`Cerca fra i valori di ${intestazione}`}
            className="mb-1.5 h-8 w-full rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 text-xs text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />

          {valori.length === 0 ? (
            <p className="px-1 py-3 text-xs text-[var(--brand-text-muted)]">
              Elenco non disponibile. Il filtro per testo e la ricerca in alto funzionano lo stesso.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-[var(--brand-text-muted)]">
                <span className="font-mono tabular-nums">
                  {spunte.size === 0 ? 'tutti' : `${spunte.size} di ${valori.length}`}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSpunte(new Set(visibili))}
                    className="rounded-[var(--radius-sm)] underline-offset-2 hover:text-[var(--brand-text-main)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    tutti
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpunte(new Set())}
                    className="rounded-[var(--radius-sm)] underline-offset-2 hover:text-[var(--brand-text-main)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  >
                    nessuno
                  </button>
                </span>
              </div>

              <div className="max-h-56 overflow-auto">
                {visibili.map((v) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs hover:bg-[var(--brand-surface-muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={spunte.has(v)}
                      onChange={() => scambia(v)}
                      className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                    />
                    <span className="truncate text-[var(--brand-text-main)]" title={v}>{v}</span>
                  </label>
                ))}
                {visibili.length === 0 && (
                  <p className="px-1.5 py-3 text-xs text-[var(--brand-text-muted)]">
                    Nessun valore con questo testo.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {filtro.tipo === 'testo' && (
        <>
          <input
            autoFocus
            type="text"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            placeholder="contiene…"
            aria-label={`${intestazione} contiene`}
            className="h-8 w-full rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 text-xs text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
          <p className="mt-1 px-1 text-[11px] text-[var(--brand-text-muted)]">
            Cerca su tutto il registro, non solo sulle righe già caricate.
          </p>
        </>
      )}

      {filtro.tipo === 'esecutore' && (
        <>
          {/*
            «Non assegnato» sta nella stessa lista delle persone, in cima: nell'AutoFiltro di Excel
            le spunte di una colonna sono in OR, e qui vale lo stesso — «gli ordini di ROSSI oppure
            quelli che non ha ancora nessuno» è la domanda vera di chi sta distribuendo il lavoro.
          */}
          <label className="mb-1 flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs hover:bg-[var(--brand-surface-muted)]">
            <input
              type="checkbox"
              checked={senzaEsec}
              onChange={() => setSenzaEsec((v) => !v)}
              className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
            />
            <span className="font-medium text-[var(--brand-text-main)]">Non assegnato</span>
          </label>

          {valori.length > 0 && (
            <>
              <input
                type="search"
                value={cercaValore}
                onChange={(e) => setCercaValore(e.target.value)}
                placeholder="Cerca un esecutore"
                aria-label="Cerca fra gli esecutori"
                className="mb-1.5 h-8 w-full rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 text-xs text-[var(--brand-text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
              <div className="max-h-48 overflow-auto border-t border-[var(--brand-border)] pt-1">
                {visibili.map((v) => (
                  <label
                    key={v}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1 text-xs hover:bg-[var(--brand-surface-muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={spunte.has(v)}
                      onChange={() => scambia(v)}
                      className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                    />
                    <span className="truncate text-[var(--brand-text-main)]">{v}</span>
                  </label>
                ))}
                {visibili.length === 0 && (
                  <p className="px-1.5 py-3 text-xs text-[var(--brand-text-muted)]">
                    Nessun esecutore con questo nome.
                  </p>
                )}
              </div>
            </>
          )}
          {valori.length === 0 && (
            <p className="px-1 py-2 text-[11px] text-[var(--brand-text-muted)]">
              Nessun intervento assegnato finora: c&apos;è solo «Non assegnato».
            </p>
          )}
        </>
      )}

      {filtro.tipo === 'data_pianificata' && (
        <>
          <div role="radiogroup" aria-label="Pianificazione">
            {PIANIFICAZIONI.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-xs hover:bg-[var(--brand-surface-muted)]"
              >
                <input
                  type="radio"
                  name={`pian-${idPannello}`}
                  checked={pian === s}
                  onChange={() => setPian(s)}
                  className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
                />
                <span className="text-[var(--brand-text-main)]">{ETICHETTE_PIANIFICAZIONE[s]}</span>
              </label>
            ))}
          </div>

          {/*
            Il giorno si spegne su «non pianificati»: un ordine senza pianificazione non può avere
            una data, e la combinazione tornerebbe sempre zero righe. Disabilitato e spiegato,
            invece che accettato e poi ignorato.
          */}
          <div className="mt-1.5 border-t border-[var(--brand-border)] pt-2">
            <label className="block px-1 text-[11px] text-[var(--brand-text-muted)]" htmlFor={`giorno-${idPannello}`}>
              Un giorno preciso
            </label>
            <input
              id={`giorno-${idPannello}`}
              type="date"
              value={giorno}
              disabled={pian === 'non_pianificati'}
              onChange={(e) => setGiorno(e.target.value)}
              className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 text-xs text-[var(--brand-text-main)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
            {pian === 'non_pianificati' && (
              <p className="mt-1 px-1 text-[11px] text-[var(--brand-text-muted)]">
                Un ordine non pianificato non ha una data.
              </p>
            )}
          </div>
        </>
      )}

      {filtro.tipo === 'scadenza' && (
        <div role="radiogroup" aria-label="Scadenza">
          {SCADENZE.map((s) => (
            <label
              key={s.v}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-xs hover:bg-[var(--brand-surface-muted)]"
            >
              <input
                type="radio"
                name={`scadenza-${idPannello}`}
                checked={scadenza === s.v}
                onChange={() => setScadenza(s.v)}
                className="h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
              />
              <span className="text-[var(--brand-text-main)]">{s.etichetta}</span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-[var(--brand-border)] pt-2">
        <Button variant="primary" size="sm" onClick={applica}>
          <Check size={13} aria-hidden="true" />
          Applica
        </Button>
        {attivo && (
          <Button variant="ghost" size="sm" onClick={azzera}>
            <X size={13} aria-hidden="true" />
            Togli
          </Button>
        )}
      </div>
    </div>
  );

  const etichetta = attivo ? `Filtro ${intestazione} (attivo)` : `Filtra ${intestazione}`;

  return (
    <>
      {/* `Tooltip` e non l'attributo `title`: il nativo compare dopo un secondo, non compare mai col
          focus da tastiera, e accanto a un `aria-label` fa annunciare il nome due volte. */}
      <Tooltip testo={etichetta} posizione="sotto">
        <button
          ref={bottone}
          type="button"
          onClick={() => (aperto ? chiudi() : apri())}
          aria-expanded={aperto}
          aria-haspopup="dialog"
          aria-controls={aperto ? idPannello : undefined}
          aria-label={etichetta}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${
            attivo
              ? 'bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
              : 'text-[var(--brand-text-muted)] opacity-60 hover:bg-[var(--brand-surface)] hover:opacity-100'
          }`}
        >
          <Filter size={12} aria-hidden="true" fill={attivo ? 'currentColor' : 'none'} />
        </button>
      </Tooltip>
      {aperto && pos && typeof document !== 'undefined'
        && createPortal(contenuto, document.body)}
    </>
  );
}
