// PURA: valori iniziali del form di revisione torre.
// Preferisce dati_correnti (eventuali correzioni precedenti); ripiega su dati_operatore.
import type { RigaRichiesta, DatiInterventoManuale } from './types';

function asDati(raw: unknown): DatiInterventoManuale | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<DatiInterventoManuale>;
  if (!o.anagrafica && !o.risposte) return null;
  return {
    committente: (o.committente ?? 'altro') as DatiInterventoManuale['committente'],
    anagrafica: o.anagrafica ?? {},
    risposte: o.risposte ?? {},
  };
}

export function datiFormRevisione(riga: RigaRichiesta): DatiInterventoManuale {
  const correnti = asDati(riga.dati_correnti);
  const operatore = asDati(riga.dati_operatore);
  const base = correnti ?? operatore;
  return {
    committente: (base?.committente ?? riga.committente) as DatiInterventoManuale['committente'],
    anagrafica: base?.anagrafica ?? {},
    risposte: base?.risposte ?? {},
  };
}
