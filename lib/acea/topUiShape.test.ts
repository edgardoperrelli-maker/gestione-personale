import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const barra = readFileSync(
  resolve(__dirname, '../../components/modules/acea/BarraAzioni.tsx'),
  'utf8',
);
const tabella = readFileSync(
  resolve(__dirname, '../../components/modules/acea/TabellaOrdini.tsx'),
  'utf8',
);

describe('marcatura TOP dalla selezione', () => {
  it('i due bottoni esistono: si mette e si toglie', () => {
    // Senza il «Togli» una marcatura sbagliata resterebbe lì per sempre.
    expect(barra).toMatch(/Segna TOP/);
    expect(barra).toMatch(/Togli TOP/);
  });

  it('scrive sulla rotta giusta e porta la famiglia della vista', () => {
    // Senza la famiglia il server scriverebbe sempre sul registro ACEA, anche dalla vista
    // dell'altra commessa.
    expect(barra).toMatch(/\/api\/acea\/ordini\/top/);
    const chiamata = barra.match(/ordini\/top[\s\S]{0,400}/)?.[0] ?? '';
    expect(chiamata).toMatch(/famiglia/);
  });

  it('la marcatura ha un suo flag di attesa, non quello della pianificazione', () => {
    // Condividere `busy` avrebbe fatto girare la rotella del «Pianifica» su un gesto che con la
    // pianificazione non c'entra.
    expect(barra).toMatch(/marcandoTop/);
  });
});

describe('evidenza TOP in tabella', () => {
  it('la riga TOP è AMBRA, mai rossa', () => {
    // Il rosso nel dunning è già revoca da verificare e ordine scaduto.
    const bloccoRiga = tabella.match(/const top = [\s\S]{0,1200}?status-warn-soft/)?.[0] ?? '';
    expect(bloccoRiga).not.toBe('');
    expect(bloccoRiga).not.toMatch(/top\s*\?\s*'bg-\[var\(--status-ko-soft\)\]'/);
  });

  it('la revoca vince sul TOP: «forse non va lavorata» batte «va lavorata per prima»', () => {
    const catena = tabella.match(/scelta[\s\S]{0,400}?surface-muted/)?.[0] ?? '';
    expect(catena).not.toBe('');
    expect(catena.indexOf('status-ko-soft')).toBeLessThan(catena.indexOf('status-warn-soft'));
  });

  it("il badge testuale c'è: il significato non dipende dal colore", () => {
    // Per chi legge in fretta e per chi i colori non li distingue.
    expect(tabella).toMatch(/>TOP<\/span>/);
  });
});
