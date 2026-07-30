'use client';

import { Search, X } from 'lucide-react';
import Button from '@/components/Button';
import Tabs from '@/components/Tabs';
import {
  pillFiltri, senzaFiltroColonna, type ChiaveColonna, type DefColonna,
} from '@/lib/acea/colonneTabella';
import {
  ETICHETTE_STATO, filtriVuoti, haFiltriAttivi, type FiltriUI, type StatoFiltro,
} from '@/lib/acea/filtriOrdini';
import type { ConteggiSchede } from './useOrdiniAcea';

type Props = {
  filtri: FiltriUI;
  onChange: (f: FiltriUI) => void;
  /** Tutte le colonne della vista, comprese le nascoste: le pill devono mostrare anche quelle. */
  colonne: DefColonna[];
  totale: number;
  caricate: number;
  /** La vista decide QUALI schede esistono: le riaperture sono dunning, e in massive non c'è la scheda. */
  famiglia: 'dunning' | 'massive';
  /**
   * Riaperture aperte senza esecutore: il badge sul tasto della scheda.
   *
   * `null` = il server non l'ha saputo calcolare, e non si disegna niente: un numero inventato su
   * un contatore d'allarme è peggio della sua assenza.
   */
  riapertureDaAssegnare?: number | null;
  /**
   * Righe di ogni scheda, prima dei filtri di colonna: il numero smorzato sul tasto.
   *
   * Sono i totali «da fermo» della famiglia — dicono quanto pesa ogni vista prima di entrarci.
   * Il conteggio della vista corrente, filtri compresi, resta il «N di M» qui accanto.
   */
  conteggi?: ConteggiSchede | null;
};

/**
 * Le schede, nell'ordine in cui si usano.
 *
 * `saracinesche` sta in fondo perche` non e` uno stato dell'ordine come gli altri tre: e` un
 * sottoinsieme che attraversa aperti e chiusi. Sta comunque in questa fila perche` e` cosi` che ci
 * si arriva — si cambia vista, non si compone un filtro.
 *
 * `riaperture` e` un sottoinsieme anche lei, ma sta SUBITO DOPO «Da lavorare» e non in fondo:
 * e` la scheda del lavoro che scade domani, e la fila si legge da sinistra. Metterla accanto alle
 * saracinesche l'avrebbe archiviata fra le viste di controllo, che e` il contrario del punto.
 *
 * In MASSIVE la scheda riaperture non esiste: le riaperture sono ordini di dunning (`RIAT`/`REVO`
 * sul ripristino da morosita`), e una scheda strutturalmente vuota non e` una vista, e` una
 * domanda senza risposta — si apre, non c'e` niente, e non si sa se e` un filtro o un guasto.
 */
const STATI: StatoFiltro[] = ['aperti', 'riaperture', 'chiusi', 'tutti', 'saracinesche'];

const statiDella = (famiglia: 'dunning' | 'massive'): StatoFiltro[] =>
  famiglia === 'massive' ? STATI.filter((s) => s !== 'riaperture') : STATI;

/**
 * Barra sopra la tabella: quello che i filtri di colonna NON possono fare.
 *
 * Dal ridisegno del 2026-07-27 i filtri per comune, attività, stato, operatore e scadenza vivono
 * nelle intestazioni (`FiltroColonna`), com'è nell'AutoFiltro di Excel. Qui restano le tre cose che
 * in un'intestazione non starebbero:
 *
 * - **la ricerca libera**, che attraversa cinque colonne insieme (ODL, matricola, impianto, via,
 *   testo ordine) e quindi non appartiene a nessuna;
 * - **aperto / chiuso**, che è un taglio sull'intero dataset e non un valore di colonna — DESIGN.md
 *   §7bis lo vuole `Tabs` in pagina, non una pagina a parte;
 * - **le pill dei filtri attivi**, che rendono visibile e removibile anche un filtro posato su una
 *   colonna nel frattempo nascosta dal menu Colonne (§7ter).
 *
 * Prima erano sei tendine impilate: ~200px sopra la tabella, e le tendine non disegnavano nemmeno
 * la loro larghezza (vedi il commento in `components/ui/Select.tsx`).
 */
export default function BarraFiltriAcea({
  filtri, onChange, colonne, totale, caricate, famiglia, riapertureDaAssegnare = null,
  conteggi = null,
}: Props) {
  const pill = pillFiltri(colonne, filtri);
  const attivi = haFiltriAttivi(filtri);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={filtri.stato}
          onValueChange={(v) => onChange({ ...filtri, stato: v as StatoFiltro })}
          items={statiDella(famiglia).map((s) => ({
            value: s,
            label: ETICHETTE_STATO[s],
            // Quante righe ha la scheda. Anche 0: su un conteggio è una risposta («è vuota»),
            // non l'allarme muto che sarebbe su un badge.
            ...(conteggi && conteggi[s as keyof ConteggiSchede] !== undefined
              ? { count: conteggi[s as keyof ConteggiSchede] }
              : {}),
            /*
              Il badge sta sul TASTO, non nei contatori di testa: deve farsi vedere da qualunque
              scheda, e la risposta giusta al vederlo — aprire le riaperture — è il click che gli
              sta sotto. Conta le SENZA ESECUTORE, non le righe della scheda: un'assegnata ma non
              finita è nella scheda ma non è un allarme, ha già qualcuno che ci sta andando.
            */
            ...(s === 'riaperture' && riapertureDaAssegnare !== null && riapertureDaAssegnare > 0
              ? {
                  badge: riapertureDaAssegnare,
                  badgeLabel: riapertureDaAssegnare === 1
                    ? '1 riapertura senza esecutore'
                    : `${riapertureDaAssegnare} riaperture senza esecutore`,
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
            placeholder="ODL, matricola, impianto, via"
            aria-label="Cerca nel registro"
            className="h-9 w-64 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] pl-8 pr-3 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
          />
        </div>

        {attivi && (
          <Button variant="ghost" size="sm" onClick={() => onChange(filtriVuoti())}>
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
