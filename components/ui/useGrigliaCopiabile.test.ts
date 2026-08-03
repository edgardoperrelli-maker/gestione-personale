import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { celleDi, normalizzaIntervallo, spostaFocus, eventoDiUnCampo } from '@/lib/acea/editingGriglia';
import { testoRighe } from '@/lib/acea/righeAppunti';

/*
  Celle copiabili fuori dal registro ordini. Il gancio è React e vive nel browser; qui si
  provano le due cose che si possono provare senza DOM e che, se cedono, rompono la copia:
  il MOTORE puro che il gancio riusa, e il CABLAGGIO delle tabelle che lo montano.
*/

const gancio = readFileSync(resolve(__dirname, './useGrigliaCopiabile.ts'), 'utf8');
const leggi = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');
const misuratori = leggi('../modules/misuratori/MisuratoriTabella.tsx');
const saracinesche = leggi('../modules/acea/Saracinesche.tsx');
const rapportini = leggi('../modules/acea/RapportiniGiorno.tsx');

describe('motore della selezione riusato dal gancio', () => {
  it('un blocco copiato esce in TSV, riga per riga', () => {
    const blocco = celleDi({ da: { riga: 0, colonna: 0 }, a: { riga: 1, colonna: 1 } });
    expect(blocco).toHaveLength(4);
    const dati = [['A', 'B'], ['C', 'D']];
    const testo = testoRighe([0, 1], ['0', '1'], (r, c) => dati[r][Number(c)]);
    expect(testo).toBe('A\tB\nC\tD');
  });

  it('una cella che contiene un a capo viene citata: la riga incollata non si spezza', () => {
    // È il caso della colonna Note, testo libero: senza le virgolette chi incolla in un foglio
    // si ritrova una riga in più, disallineata da lì in giù, e niente glielo dice.
    const testo = testoRighe([0], ['0', '1'], (_r, c) => (c === '0' ? 'nota\ncon a capo' : 'X'));
    expect(testo).toBe('"nota\ncon a capo"\tX');
  });

  it('shift-click a ritroso seleziona lo stesso blocco: l\'ordine dei due angoli non conta', () => {
    const avanti = normalizzaIntervallo({ da: { riga: 0, colonna: 0 }, a: { riga: 2, colonna: 3 } });
    const indietro = normalizzaIntervallo({ da: { riga: 2, colonna: 3 }, a: { riga: 0, colonna: 0 } });
    expect(indietro).toEqual(avanti);
  });

  it('il bordo ferma le frecce: nessun giro dall\'altra parte', () => {
    const limiti = { righe: 3, colonne: 2 };
    expect(spostaFocus({ riga: 0, colonna: 0 }, 'su', limiti)).toEqual({ riga: 0, colonna: 0 });
    expect(spostaFocus({ riga: 2, colonna: 1 }, 'destra', limiti)).toEqual({ riga: 2, colonna: 1 });
  });

  it('gli eventi nati in un campo restano al campo', () => {
    // Senza questo filtro, con una cella selezionata la griglia si prendeva frecce e Ctrl+C di
    // OGNI campo della pagina: nel filtro di ricerca il cursore non si muoveva più.
    expect(eventoDiUnCampo({ closest: (s) => (s.includes('input') ? {} : null) })).toBe(true);
    expect(eventoDiUnCampo({ isContentEditable: true })).toBe(true);
    expect(eventoDiUnCampo({ closest: () => null })).toBe(false);
    expect(eventoDiUnCampo(null)).toBe(false);
  });
});

describe('il gancio non scrive e non ruba', () => {
  it('è di SOLA LETTURA: nessun incolla, nessuna scrittura', () => {
    // Le tabelle che lo montano hanno i loro editor; un incolla qui li scavalcherebbe.
    expect(gancio).not.toMatch(/'paste'|onPaste|parseBloccoIncollato/);
  });

  it('si ferma sulla soglia dei campi, su tastiera E appunti', () => {
    const usi = gancio.match(/eventoDiUnCampo\(/g) ?? [];
    expect(usi.length).toBeGreaterThanOrEqual(2);
  });

  it('il click su un elemento interattivo non sposta il cursore di cella', () => {
    // Spunte, tendine di stato ed editor di nota: quel click è già il comando di qualcun altro.
    expect(gancio).toMatch(/closest\?\.\(INTERATTIVI\)/);
    expect(gancio).toMatch(/const INTERATTIVI = '[^']*input[^']*select[^']*button/);
  });
});

describe('le tabelle dei moduli ACEA e AcquaLatina montano il gancio', () => {
  it('tutte e tre lo importano e lo usano', () => {
    for (const [nome, src] of [
      ['MisuratoriTabella', misuratori],
      ['Saracinesche', saracinesche],
      ['RapportiniGiorno', rapportini],
    ] as const) {
      expect(src, `${nome} deve importare il gancio`).toMatch(
        /from '@\/components\/ui\/useGrigliaCopiabile'/,
      );
      expect(src, `${nome} deve montarlo`).toMatch(/useGrigliaCopiabile\(\{/);
      expect(src, `${nome} deve spalmare le props sulle celle`).toMatch(/propsCella\(/);
      expect(src, `${nome} deve applicare le classi di selezione`).toMatch(/classeCella\(/);
    }
  });

  it('la tabella misuratori ha UN modello di colonne, non tre liste parallele', () => {
    // Header, celle e valori da copiare pescano dallo stesso array: con PDR e Pallet
    // condizionali, tre liste parallele si sfalsano e si copia la colonna sbagliata.
    expect(misuratori).toMatch(/const colonne = useMemo\(/);
    expect(misuratori).toMatch(/colonne\.map\(\(\{ key, label \}\)/);
    expect(misuratori).toMatch(/const iCol = useCallback\(/);
  });

  it('il valore copiato è il testo che si VEDE', () => {
    // Data all'italiana e stato in chiaro: chi copia incolla in un foglio da leggere.
    expect(misuratori).toMatch(/valore: r => formatItalian\(r\.data_esecuzione\)/);
    expect(misuratori).toMatch(/valore: r => STATO_LABEL\[r\.stato\]/);
  });
});
