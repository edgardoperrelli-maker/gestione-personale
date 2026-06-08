import type { TemplateCampo } from './buildVoci';

/** Valori anagrafici d'esempio per l'anteprima del template (tutti i campi info + coordinata). */
export const SAMPLE_VOCE_INFO = {
  nominativo: 'Mario Rossi',
  matricola: 'MAT0012345',
  pdr: '00594202203925',
  odl: '20043151148',
  via: 'VIA ROMA 1',
  comune: 'Roma',
  cap: '00184',
  recapito: '333 1234567',
  attivita: 'S-PR-007',
  accessibilita: 'Libero',
  fascia_oraria: '08:00-10:00',
  coordinate: '41.853305, 12.782855',
} as const;

/** Risposte d'esempio per i campi del template, così l'anteprima appare "compilata". */
export function sampleRisposte(campi: TemplateCampo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  campi.forEach((c, i) => {
    switch (c.tipo) {
      case 'crocetta': out[c.chiave] = i % 2 === 0; break;
      case 'numero': out[c.chiave] = '1'; break;
      case 'select': out[c.chiave] = c.opzioni?.[0] ?? 'Opzione'; break;
      case 'testo': out[c.chiave] = 'esempio'; break;
      default: break; // foto / altri tipi: nessun valore d'esempio
    }
  });
  return out;
}
