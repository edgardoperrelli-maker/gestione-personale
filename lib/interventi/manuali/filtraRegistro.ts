// PURA: applica i filtri del registro autorizzazioni (AND tra i campi valorizzati).
import type { RigaRichiesta } from './types';
import { datiAnagraficaCoda } from './filtraCoda';

export type FiltriRegistro = {
  operatore: string;   // staff_id; '' = tutti
  stato: string;       // StatoRichiesta; '' = tutti
  committente: string; // CommittenteManuale; '' = tutti
  from: string;        // YYYY-MM-DD; '' = nessun limite inferiore
  to: string;          // YYYY-MM-DD; '' = nessun limite superiore
  ricerca?: string;    // substring su via/matricola/ODL; '' o assente = nessuna ricerca
};

export function filtraRegistro(righe: RigaRichiesta[], f: FiltriRegistro): RigaRichiesta[] {
  const q = (f.ricerca ?? '').trim().toLowerCase();
  return (righe ?? []).filter((r) => {
    if (f.operatore && r.staff_id !== f.operatore) return false;
    if (f.stato && r.stato !== f.stato) return false;
    if (f.committente && r.committente !== f.committente) return false;
    if (f.from && (r.data ?? '') < f.from) return false;
    if (f.to && (r.data ?? '') > f.to) return false;
    if (q) {
      const d = datiAnagraficaCoda(r);
      const hay = `${d.via} ${d.matricola} ${d.odl}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
