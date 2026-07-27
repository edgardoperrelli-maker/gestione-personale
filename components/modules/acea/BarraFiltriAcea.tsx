'use client';

import { Search, X } from 'lucide-react';
import Button from '@/components/Button';
import Select from '@/components/ui/Select';
import { FILTRI_VUOTI, type FiltriUI, type Opzioni } from './useOrdiniAcea';

type Props = {
  filtri: FiltriUI;
  onChange: (f: FiltriUI) => void;
  opzioni: Opzioni;
  /** La vista massive non ha scadenze: il filtro non va mostrato. */
  conScadenza: boolean;
  totale: number;
  caricate: number;
};

const CLASSE_INPUT =
  'h-9 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]';

/** Filtri della tabella ordini: gli stessi gesti dell'AutoFiltro di Excel, più il conteggio. */
export default function BarraFiltriAcea({
  filtri, onChange, opzioni, conScadenza, totale, caricate,
}: Props) {
  const set = <K extends keyof FiltriUI>(k: K, v: FiltriUI[K]) => onChange({ ...filtri, [k]: v });
  const attivi =
    filtri.stato !== FILTRI_VUOTI.stato || filtri.comune !== '' || filtri.attivita !== '' ||
    filtri.operatore !== '' || filtri.scadenza !== 'tutte' || filtri.cerca !== '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--brand-text-muted)]"
        />
        <input
          type="search"
          value={filtri.cerca}
          onChange={(e) => set('cerca', e.target.value)}
          placeholder="ODL, matricola, impianto, via"
          aria-label="Cerca nel registro"
          className={`${CLASSE_INPUT} w-56 pl-8`}
        />
      </div>

      <Select
        value={filtri.stato}
        onChange={(e) => set('stato', e.target.value as FiltriUI['stato'])}
        aria-label="Stato"
        className="h-9 w-36"
      >
        <option value="aperti">Da lavorare</option>
        <option value="chiusi">Chiusi</option>
        <option value="tutti">Tutti gli stati</option>
      </Select>

      <Select
        value={filtri.comune}
        onChange={(e) => set('comune', e.target.value)}
        aria-label="Comune"
        className="h-9 w-44"
      >
        <option value="">Tutti i comuni</option>
        {opzioni.comuni.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>

      <Select
        value={filtri.attivita}
        onChange={(e) => set('attivita', e.target.value)}
        aria-label="Attività"
        className="h-9 w-52"
      >
        <option value="">Tutte le attività</option>
        {opzioni.attivita.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>

      {conScadenza && (
        <Select
          value={filtri.scadenza}
          onChange={(e) => set('scadenza', e.target.value as FiltriUI['scadenza'])}
          aria-label="Scadenza"
          className="h-9 w-44"
        >
          <option value="tutte">Qualsiasi scadenza</option>
          <option value="scaduti">Oltre la scadenza</option>
          <option value="in_scadenza">In scadenza (7 gg)</option>
          <option value="senza_scadenza">Senza scadenza</option>
        </Select>
      )}

      <Select
        value={filtri.operatore}
        onChange={(e) => set('operatore', e.target.value)}
        aria-label="Operatore ACEA"
        className="h-9 w-44"
      >
        <option value="">Ogni operatore ACEA</option>
        {opzioni.operatori.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>

      {attivi && (
        <Button variant="ghost" size="sm" onClick={() => onChange(FILTRI_VUOTI)}>
          <X size={14} aria-hidden="true" />
          Azzera
        </Button>
      )}

      <span className="ml-auto font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
        {caricate < totale ? `${caricate} di ${totale}` : `${totale}`} righe
      </span>
    </div>
  );
}
