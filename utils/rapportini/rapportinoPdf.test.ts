// utils/rapportini/rapportinoPdf.test.ts
import { describe, it, expect } from 'vitest';
import { nomeFilePdf, generaRiepilogoPdfBlob } from './rapportinoPdf';
import type { DatiRiepilogoPdf } from './datiRiepilogoPdf';

describe('nomeFilePdf', () => {
  it('sanifica nome operatore e usa la data ISO (YYYY-MM-DD)', () => {
    expect(nomeFilePdf('Mario Rossi', '2026-06-04')).toBe('Rapportino_Mario_Rossi_2026-06-04.pdf');
  });
  it('rimuove accenti e simboli', () => {
    expect(nomeFilePdf("D'Amico Niccolò", '2026-06-04T10:00:00')).toBe('Rapportino_D_Amico_Niccolo_2026-06-04.pdf');
  });
  it('fallback se nome vuoto', () => {
    expect(nomeFilePdf('', '2026-06-04')).toBe('Rapportino_operatore_2026-06-04.pdf');
  });
});

describe('generaRiepilogoPdfBlob', () => {
  const dati: DatiRiepilogoPdf = {
    staffName: 'Mario Rossi',
    dataLabel: '04/06/2026',
    stats: { totali: 2, eseguiti: 1, nonEseguiti: 1 },
    lavorazioni: [{ etichetta: 'CAMBIO', count: 1 }],
    eseguiti: [{ n: 1, nominativo: 'Esposito Anna', pdr: '111', indirizzo: 'Via Toledo 45 · Napoli', attivita: 'Sost.' }],
    nonEseguiti: [{ n: 2, nominativo: 'Conte Rosa', pdr: '222', indirizzo: 'Via Diaz 22 · Napoli', attivita: 'Sost.', motivo: 'Assente' }],
  };
  it('produce un Blob PDF non vuoto', async () => {
    const blob = await generaRiepilogoPdfBlob(dati);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });
});
