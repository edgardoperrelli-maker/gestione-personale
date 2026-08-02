'use client';

import { Search, X } from 'lucide-react';
import Button from '@/components/Button';
import Tabs from '@/components/Tabs';
import {
  pillFiltri, senzaFiltroColonna, type ChiaveColonna, type DefColonna,
} from '@/lib/acea/colonneTabella';
import {
  applicaScheda, azzeraFiltri, haFiltriAttivi, schedeVista, valoreScheda, type FiltriUI,
} from '@/lib/acea/filtriOrdini';
import type { Famiglia } from '@/lib/acea/famiglia';

type Props = {
  filtri: FiltriUI;
  onChange: (f: FiltriUI) => void;
  /** Tutte le colonne della vista, comprese le nascoste: le pill devono mostrare anche quelle. */
  colonne: DefColonna[];
  totale: number;
  caricate: number;
  /**
   * La vista decide QUALI schede esistono (vedi `schedeVista`): il dunning ha gli stati di
   * sempre — le riaperture sono sue, e in massive quella scheda non si disegna proprio — le
   * massive hanno un tasto per comune più i riepiloghi, acqualatina due schede secche.
   */
  famiglia: Famiglia;
  /** Comuni con ordini aperti: le schede della vista massive. In dunning resta vuoto. */
  comuni?: readonly string[];
  /**
   * Attivazioni aperte SENZA una data di pianificazione: il triangolo rosso sul tasto della
   * scheda. Hanno un giorno di cardine — quella fuori calendario è quella che scade domani e
   * sparisce senza che nessuno la veda.
   *
   * `null` = il server non l'ha saputo calcolare, e non si disegna niente: un numero inventato su
   * un contatore d'allarme è peggio della sua assenza.
   */
  riapertureSenzaData?: number | null;
};

/**
 * Barra sopra la tabella: quello che i filtri di colonna NON possono fare.
 *
 * Dal ridisegno del 2026-07-27 i filtri per comune, attività, stato, operatore e scadenza vivono
 * nelle intestazioni (`FiltroColonna`), com'è nell'AutoFiltro di Excel. Qui restano le tre cose che
 * in un'intestazione non starebbero:
 *
 * - **la ricerca libera**, che attraversa sei colonne insieme (ODL, matricola, impianto, via,
 *   testo ordine, nome utente) e quindi non appartiene a nessuna;
 * - **aperto / chiuso**, che è un taglio sull'intero dataset e non un valore di colonna — DESIGN.md
 *   §7bis lo vuole `Tabs` in pagina, non una pagina a parte;
 * - **le pill dei filtri attivi**, che rendono visibile e removibile anche un filtro posato su una
 *   colonna nel frattempo nascosta dal menu Colonne (§7ter).
 *
 * Prima erano sei tendine impilate: ~200px sopra la tabella, e le tendine non disegnavano nemmeno
 * la loro larghezza (vedi il commento in `components/ui/Select.tsx`).
 */
export default function BarraFiltriAcea({
  filtri, onChange, colonne, totale, caricate, famiglia, comuni = [], riapertureSenzaData = null,
}: Props) {
  const pill = pillFiltri(colonne, filtri);
  const attivi = haFiltriAttivi(filtri);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={valoreScheda(filtri)}
          onValueChange={(v) => onChange(applicaScheda(filtri, v))}
          items={schedeVista(famiglia, comuni).map((s) => ({
            ...s,
            /*
              Il triangolo sta sul TASTO, non nei contatori di testa: deve farsi vedere da
              qualunque scheda, e la risposta giusta al vederlo — aprire le riaperture — è il
              click che gli sta sotto. Conta le attivazioni SENZA DATA di pianificazione, non le
              righe della scheda: una in calendario ma non finita è nella scheda ma non è un
              allarme, ha già un giorno in cui qualcuno ci va.
            */
            ...(s.value === 'riaperture' && riapertureSenzaData !== null && riapertureSenzaData > 0
              ? {
                  badge: riapertureSenzaData,
                  badgeLabel: riapertureSenzaData === 1
                    ? '1 attivazione senza data di pianificazione'
                    : `${riapertureSenzaData} attivazioni senza data di pianificazione`,
                }
              : {}),
          }))}
        />

        <div className="relative">
          <Search
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--brand-text-muted)]"
          />
          <input
            type="search"
            value={filtri.cerca}
            onChange={(e) => onChange({ ...filtri, cerca: e.target.value })}
            /*
              Il suggerimento dice le colonne che su QUESTA vista contengono qualcosa: il nome
              utente esiste solo nel registro acqualatina (su ACEA la colonna è NULL per
              costruzione), e prometterlo dove non c'è farebbe cercare a vuoto. Il campo è largo
              w-64: l'elenco si accorcia dove si allunga.
            */
            placeholder={famiglia === 'acqualatina'
              ? 'ODL, cod. fornitura, matricola, utente'
              : 'ODL, matricola, impianto, via'}
            aria-label="Cerca nel registro"
            className="h-9 w-64 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] pl-8 pr-3 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>

        {attivi && (
          // «Azzera» ripulisce i filtri ma NON cambia scheda: da quando le schede massive sono i
          // comuni, azzerare non deve buttare fuori dal paese in cui si sta lavorando.
          <Button variant="ghost" size="sm" onClick={() => onChange(azzeraFiltri(filtri))}>
            <X size={14} aria-hidden="true" />
            Azzera
          </Button>
        )}

        <span className="ml-auto font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
          {caricate < totale ? `${caricate} di ${totale}` : `${totale}`} righe
        </span>
      </div>

      {pill.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5">
          {pill.map((p) => (
            <li key={p.chiave}>
              <button
                type="button"
                onClick={() => onChange(senzaFiltroColonna(colonne, filtri, p.chiave as ChiaveColonna))}
                aria-label={`Togli il filtro su ${p.intestazione}`}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] px-2 py-1 text-xs text-[var(--brand-text-main)] transition-colors hover:border-[var(--brand-border-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                <span className="font-semibold">{p.intestazione}</span>
                <span className="max-w-56 truncate text-[var(--brand-text-muted)]">{p.descrizione}</span>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
