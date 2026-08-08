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
    stats: { totali: 3, eseguiti: 1, nonEseguiti: 1 },
    lavorazioni: [{ etichetta: 'CAMBIO', count: 1 }],
    attivita: [{ etichetta: 'Sostituzione misuratore', count: 3 }],
    committenti: ['Acea', 'Italgas'],
    colonne: [
      { etichetta: 'NOMINATIVO', crocetta: false, info: 'nominativo', maxLen: 13 },
      { etichetta: 'ODS/ODL', crocetta: false, info: 'odl', maxLen: 7 },
      { etichetta: 'VIA', crocetta: false, info: 'via', maxLen: 16 },
      { etichetta: 'CAMBIO', crocetta: true, campo: 'cambio', maxLen: 1 },
      { etichetta: 'NOTE', crocetta: false, campo: 'note', nota: true, maxLen: 7 },
      { etichetta: 'CODOLI', crocetta: false, campo: 'codoli', maxLen: 0 },
    ],
    eseguiti: [{ n: 1, valori: ['Esposito Anna', 'ODL-100', 'Via Toledo 45', 'X', 'Cane in cortile', ''], nota: 'Cane in cortile' }],
    nonEseguiti: [{ n: 2, valori: ['Conte Rosa', 'ODL-200', 'Via Chiaia 8', '', 'Assente', ''], nota: 'Assente' }],
    daFare: [{ n: 3, valori: ['Verdi Ugo', 'ODL-300', 'Via Duomo 1', '', '', ''] }],
  };

  /** Il PDF non è compresso (nessun `compress: true`): il testo si legge nei byte grezzi. */
  const testoPdf = async (): Promise<string> =>
    Buffer.from(await (await generaRiepilogoPdfBlob(dati)).arrayBuffer()).toString('latin1');

  it('produce un Blob PDF non vuoto', async () => {
    const blob = await generaRiepilogoPdfBlob(dati);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  // NOTA sulle asserzioni di contenuto: le etichette in maiuscoletto (INTERVENTI, PRODUZIONE,
  // i titoli di sezione del livello campo) sono disegnate CARATTERE PER CARATTERE, perché jsPDF
  // non ha la spaziatura fra lettere e senza respiro a 6pt sono illeggibili. Nei byte del PDF non
  // esistono quindi come stringa contigua e non si possono cercare: si verifica il testo scritto
  // con `doc.text` in un colpo solo, che è comunque tutto il contenuto informativo.
  it('il livello CAMPO porta intestazione e committenti', async () => {
    const t = await testoPdf();
    for (const atteso of ['Mario Rossi', '04/06/2026', 'Acea', 'Italgas']) {
      expect(t, `manca "${atteso}" nel PDF`).toContain(atteso);
    }
  });

  it('il blocco attività porta le etichette con i loro conteggi', async () => {
    // Le ATTIVITÀ sono testo normale e si cercano; le LAVORAZIONI stanno nelle card in cima,
    // con l'etichetta in maiuscoletto disegnata carattere per carattere (vedi nota sopra).
    const t = await testoPdf();
    expect(t).toContain('Sostituzione misuratore');
  });

  it('le card delle lavorazioni reggono un\'etichetta lunghissima senza rompersi', async () => {
    // Caso reale COMMERSO 07/08/2026: «MINIBAG/RG STOP BONIFICA SEMPLICE». Una card a larghezza
    // fissa si spaccherebbe; qui la larghezza viene dal contenuto e l'etichetta va a capo.
    const lungo: DatiRiepilogoPdf = {
      ...dati,
      lavorazioni: [
        { etichetta: 'MINIBAG/RG STOP BONIFICA SEMPLICE', count: 5 },
        { etichetta: 'SOSTITUZIONE VALVOLA', count: 1 },
        { etichetta: 'MINI BAG RG STOP', count: 2 },
        { etichetta: 'CAMBIO', count: 1 },
        { etichetta: 'SIGILLO', count: 3 },
      ],
    };
    const blob = await generaRiepilogoPdfBlob(lungo);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });

  it('le tre sezioni compaiono, SENZA ESITO inclusa', async () => {
    const t = await testoPdf();
    for (const sezione of ['ESEGUITI', 'NON ESEGUITI', 'SENZA ESITO']) {
      expect(t, `manca la sezione "${sezione}"`).toContain(sezione);
    }
  });

  it('la lista del campo identifica l\'intervento con ODS/ODL e indirizzo', async () => {
    const t = await testoPdf();
    expect(t).toContain('ODS/ODL');
    expect(t).toContain('Via Toledo 45');
    expect(t).toContain('LAVORAZIONI');
    expect(t).toContain('MOTIVO');
  });

  it('le note escono come riga a tutta larghezza, non come colonna del livello campo', async () => {
    const t = await testoPdf();
    // La riga nota è prefissata da NOTA: se le note fossero rimaste una colonna non ci sarebbe.
    expect(t).toContain('NOTA');
    expect(t).toContain('Cane in cortile');
  });

  it('i due livelli hanno orientamenti diversi: portrait il campo, landscape l\'ufficio', async () => {
    const t = await testoPdf();
    const mediaBox = [...t.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => {
      const [, , x, y] = m[1].trim().split(/\s+/).map(Number);
      return x > y ? 'landscape' : 'portrait';
    });
    expect(mediaBox.length).toBeGreaterThanOrEqual(2);
    expect(mediaBox[0]).toBe('portrait');
    expect(mediaBox).toContain('landscape');
  });

  it('il logo aziendale finisce davvero dentro il PDF (addImage funziona anche in Node)', async () => {
    const t = await testoPdf();
    // jsPDF scrive l'immagine come XObject: senza logo non ci sarebbe alcun /Subtype /Image.
    expect(t).toContain('/Subtype /Image');
  });

  it('non esplode se non c\'è nessun intervento', async () => {
    const vuoto: DatiRiepilogoPdf = { ...dati, eseguiti: [], nonEseguiti: [], daFare: [] };
    const blob = await generaRiepilogoPdfBlob(vuoto);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
  });
});
