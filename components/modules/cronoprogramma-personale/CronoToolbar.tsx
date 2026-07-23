'use client';
import Button from '@/components/Button';
import ObjectHeader from '@/components/ui/ObjectHeader';
import MultiSelect from '@/components/ui/MultiSelect';
import type { Territory } from '@/types';

/**
 * Testa del modulo Cronoprogramma. Dal 2026-07-23 usa `ObjectHeader` come tutti
 * gli altri moduli (DESIGN.md §7ter) invece di una barra su misura: il periodo
 * resta fra le due frecce, che ora hanno un nome accessibile — prima si
 * chiamavano «<» e «>» e per uno screen reader non volevano dire niente.
 *
 * Ospita anche l'ordinamento, che è un controllo di VISTA: prima viveva come
 * pulsante «A-Z» ripetuto dentro ogni colonna-giorno — sette copie dello stesso
 * comando globale, e con una sola delle sei modalità raggiungibile.
 */
export default function CronoToolbar({
  title,
  reperibili,
  territori,
  territoriSelezionati,
  onTerritoriChange,
  onPrev,
  onNext,
  onToday,
  onInsertRep,
  onNewAssenza,
  onExport,
}: {
  title: string;
  reperibili: number;
  territori: Territory[];
  territoriSelezionati: string[];
  onTerritoriChange: (ids: string[]) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onInsertRep: () => void;
  onNewAssenza: () => void;
  onExport: () => void;
}) {
  return (
    <ObjectHeader
      title="Cronoprogramma"
      sub="Turni, reperibilità e assenze del personale."
      actions={
        <>
          {/* `flex-wrap` + niente larghezza minima sulla data: a 320px un gruppo
              rigido da 10rem sfondava la pagina in orizzontale (gate 34). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button onClick={onPrev} size="sm" aria-label="Periodo precedente">
              ‹
            </Button>
            <span className="whitespace-nowrap text-center text-sm font-semibold tracking-tight text-[var(--brand-text-main)] sm:min-w-[10rem]">
              {title}
            </span>
            <Button onClick={onNext} size="sm" aria-label="Periodo successivo">
              ›
            </Button>
            <Button onClick={onToday} variant="soft" size="sm">
              Oggi
            </Button>
          </div>

          {/* Filtro territori: il motore `filterAssignments` gestiva già i token
              `TERR:<id>`, ma nessun comando li produceva — la macchina c'era e
              non era raggiungibile, come per l'ordinamento. */}
          <MultiSelect
            label="Territori"
            ariaLabel="Filtra per territorio"
            options={territori.map((t) => ({ value: t.id, label: t.name }))}
            values={territoriSelezionati}
            onChange={onTerritoriChange}
            selezioneEsplicita
          />

          {/* Reperibili nel range — spostato qui dalle stat card */}
          {reperibili > 0 && (
            <span className="rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-primary-soft)] px-3 py-1.5 text-sm">
              <span className="text-[var(--brand-text-muted)]">Reperibili </span>
              <span className="font-semibold text-[var(--primary-text)]">{reperibili}</span>
            </span>
          )}

          <Button onClick={onNewAssenza} size="sm" variant="soft">
            Assenza
          </Button>
          <Button onClick={onInsertRep} size="sm">
            Inserisci reperibile
          </Button>
          <Button onClick={onExport} variant="outline" size="sm">
            Esporta
          </Button>
        </>
      }
    />
  );
}
