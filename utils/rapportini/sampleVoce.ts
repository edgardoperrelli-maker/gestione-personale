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

/**
 * Tre voci d'esempio per l'anteprima della LISTA: dati diversi in ogni campo, così l'admin
 * vede subito quale colonna sta guardando e come si comporta la riga quando il testo cresce.
 */
export const SAMPLE_VOCI_LISTA = [
  SAMPLE_VOCE_INFO,
  {
    ...SAMPLE_VOCE_INFO,
    nominativo: 'Anna Verdi',
    matricola: 'MAT0067890',
    pdr: '00594202207781',
    odl: '20043151149',
    via: 'VIA APPIA NUOVA 128/SC',
    comune: 'Latina',
    cap: '04100',
    recapito: '333 7654321',
    attivita: 'S-PR-012',
    fascia_oraria: '10:00-12:00',
  },
  {
    ...SAMPLE_VOCE_INFO,
    nominativo: 'Luca Bianchi',
    matricola: 'MAT0099887',
    pdr: '00594202209912',
    odl: '20043151150',
    via: 'VIA EMILIA 5',
    comune: 'Terracina',
    cap: '04019',
    recapito: '333 1122334',
    attivita: 'S-PR-003',
    fascia_oraria: '14:00-16:00',
  },
] as const;

/** Risposte d'esempio per i campi del template, così l'anteprima appare "compilata". */
export function sampleRisposte(campi: TemplateCampo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  campi.forEach((c, i) => {
    switch (c.tipo) {
      case 'crocetta': out[c.chiave] = i % 2 === 0; break;
      case 'numero': out[c.chiave] = '1'; break;
      case 'select': out[c.chiave] = c.opzioni?.[0] ?? 'Opzione'; break;
      case 'testo': out[c.chiave] = 'esempio'; break;
      case 'matricola': out[c.chiave] = 'AL2600123456'; break;
      default: break; // foto / altri tipi: nessun valore d'esempio
    }
  });
  return out;
}
