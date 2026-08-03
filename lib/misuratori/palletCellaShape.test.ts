import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Il pallet si scrive NELLA CELLA, una riga alla volta, oltre che in blocco dalla barra della
  cesta. Questi test tengono ferme le tre regole che rendono l'editor sicuro — le stesse della
  nota, che le aveva imparate a caro prezzo: Escape annulla, niente PATCH a vuoto, e nessun
  doppio commit. Sono guardie di forma sul sorgente: la logica vera vive nel browser.
*/

const tabella = readFileSync(
  resolve(__dirname, '../../components/modules/misuratori/MisuratoriTabella.tsx'),
  'utf8',
);
const client = readFileSync(
  resolve(__dirname, '../../components/modules/misuratori/MisuratoriClient.tsx'),
  'utf8',
);

describe('pallet scrivibile nella cella', () => {
  it('la cella ha un editor, non solo testo', () => {
    expect(tabella).toMatch(/editingPallet === row\.id \? \(/);
    expect(tabella).toMatch(/data-pallet-btn=\{row\.id\}/);
  });

  it('Escape ANNULLA e il blur che segue non committa', () => {
    // Senza il flag, l'unmount dell'editor fa scattare un blur che salverebbe il valore
    // appena rifiutato: l'Escape diventerebbe un salva travestito da annulla.
    expect(tabella).toMatch(/annullaPallet\.current = true/);
    expect(tabella).toMatch(/if \(annullaPallet\.current\) \{ annullaPallet\.current = false; return; \}/);
  });

  it('nessuna PATCH a vuoto: aprire e chiudere senza toccare non è un salvataggio', () => {
    expect(tabella).toMatch(/if \(pulito === \(palletOriginale \?\? ''\)\.trim\(\)\) return;/);
  });

  it('guardia di rientro: un gesto, una PATCH', () => {
    // Su Invio l'editor si smonta e il blur che segue richiamerebbe il commit una seconda volta.
    expect(tabella).toMatch(/if \(editingPallet !== id\) return;/);
  });

  it('il campo NON è numerico: il pallet è un riferimento, non una quantità', () => {
    // `type="number"` mangerebbe gli zeri di testa e le frecce del mouse potrebbero cambiarlo
    // per sbaglio scorrendo la tabella.
    // I commenti si tolgono PRIMA di cercare: quello dentro la cella spiega la scelta
    // CITANDO `type="number"`, e senza questa riga il test leggeva la spiegazione invece
    // dell'attributo — passando a vuoto o fallendo a torto.
    const senzaCommenti = tabella.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const cella = senzaCommenti.match(/aria-label=\{`Pallet per il misuratore[\s\S]*?\/>/)?.[0] ?? '';
    expect(cella).not.toBe('');
    expect(cella).toMatch(/inputMode="numeric"/);
    expect(cella).not.toMatch(/type="number"/);
  });

  it('il client accetta il pallet nella PATCH (e lo applica in ottimistica)', () => {
    // Senza `pallet` nel tipo la cella non compilerebbe; senza lo spread la riga tornerebbe
    // al valore vecchio fino al prossimo caricamento.
    expect(client).toMatch(/patch: \{ stato\?: StatoMisuratore; note\?: string; pallet\?: string \}/);
    expect(client).toMatch(/r\.id === id \? \{ \.\.\.r, \.\.\.patch \}/);
  });

  it("l'assegnazione in blocco dalla barra resta: le due strade convivono", () => {
    // La cella serve a CORREGGERE una riga; il gesto vero — «la cesta è piena» — resta quello
    // massivo, e toglierlo per far posto all'editor sarebbe stato un pessimo scambio.
    expect(client).toMatch(/handleAssegnaPallet/);
  });
});
