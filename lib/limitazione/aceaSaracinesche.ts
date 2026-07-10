import { valoreSaracinesca } from './exportLimMassive';

const t = (v: string | null | undefined): string => String(v ?? '').trim();

/** Riga grezza per l'aggregazione: un intervento completato con odl + le due chiavi possibili
 *  della saracinesca dal rapportino (stesse due chiavi di lib/limitazione/exportLimMassive.ts). */
export type RigaSaracinescaDb = {
  odl: string | null;
  sostituzione_valvola: unknown;
  sost_valvola: unknown;
};

/** Riga di output: un ODL per cui il DB registra una saracinesca sostituita. */
export type RigaSaracinescaOdl = {
  odl: string;
  saracinesca: 'SI';
};

/**
 * Aggrega le righe DB per ODL: un ODL entra nel risultato se ALMENO UN intervento completato su
 * quell'ODL ha la saracinesca sostituita (valore letterale "SI", case-insensitive). Dedup per odl
 * (un odl con più righe, anche miste, compare una sola volta se almeno una è SI). Righe con odl
 * vuoto, o la cui saracinesca non è "SI" (vuota, "NO", testo libero, path-foto), vengono scartate.
 */
export function aggregaSaracinescaPerOdl(righe: RigaSaracinescaDb[]): RigaSaracinescaOdl[] {
  const odlConSaracinesca = new Set<string>();
  for (const r of righe) {
    const odl = t(r.odl);
    if (!odl) continue;
    const sar = valoreSaracinesca(r.sostituzione_valvola, r.sost_valvola);
    if (sar.toUpperCase() === 'SI') odlConSaracinesca.add(odl);
  }
  return [...odlConSaracinesca].map((odl) => ({ odl, saracinesca: 'SI' as const }));
}
