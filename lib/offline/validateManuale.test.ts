import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validaManualeClient } from './validateManuale';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

const campi: TemplateCampo[] = [
  { chiave: 'foto_contatore', tipo: 'foto', etichetta: 'Foto contatore', ordine: 1, obbligatoria: true } as TemplateCampo,
];

describe('validaManualeClient', () => {
  it('ok con anagrafica valida e foto obbligatorie presenti', () => {
    const r = validaManualeClient({ anagrafica: { pdr: '123', via: 'Roma' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: true } });
    expect(r.ok).toBe(true);
  });
  it('errore se manca identificativo/indirizzo', () => {
    const r = validaManualeClient({ anagrafica: { note: 'x' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: true } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/identificativo|indirizzo/i);
  });
  it('errore se manca una foto obbligatoria', () => {
    const r = validaManualeClient({ anagrafica: { pdr: '123', via: 'Roma' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: false } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/foto/i);
  });
  it('esito negativo → foto non obbligatorie (ok anche senza foto)', () => {
    const campiNeg = [
      ...campi,
      { chiave: 'assente', etichetta: 'Assente', tipo: 'crocetta', ordine: 2 } as TemplateCampo,
    ];
    const r = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campiNeg,
      slotFotoPresenti: { foto_contatore: false },
      risposte: { assente: true },
    });
    expect(r.ok).toBe(true);
  });

  it('Sostituzione valvola = SI → foto valvola obbligatoria', () => {
    const campiValvola: TemplateCampo[] = [
      { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 } as TemplateCampo,
      { chiave: 'sost_valvola', etichetta: 'Sost. Valvola', tipo: 'foto', ordine: 2 } as TemplateCampo,
    ];
    const senza = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campiValvola,
      slotFotoPresenti: { sost_valvola: false },
      risposte: { sostituzione_valvola: 'SI' },
    });
    expect(senza.ok).toBe(false);
    if (!senza.ok) expect(senza.motivo).toMatch(/Sost\. Valvola/);

    const con = validaManualeClient({
      anagrafica: { pdr: '123', via: 'Roma' },
      campiTemplate: campiValvola,
      slotFotoPresenti: { sost_valvola: true },
      risposte: { sostituzione_valvola: 'SI' },
    });
    expect(con.ok).toBe(true);
  });
});

// Regressione: il messaggio nominava sempre via/comune, anche per i committenti che l'indirizzo
// non lo chiedono. Mandava l'operatore a compilare un campo che nessuno gli stava domandando.
describe('validaManualeClient — il motivo descrive la regola applicata', () => {
  it('lim_massive: chiede solo un identificativo, e non nomina l\'indirizzo', () => {
    const r = validaManualeClient({ anagrafica: {}, campiTemplate: [], slotFotoPresenti: {}, committente: 'lim_massive' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toMatch(/identificativo/i);
      expect(r.motivo).not.toMatch(/indirizzo|via|comune/i);
    }
  });
  it('lim_massive con la sola matricola: passa (l\'indirizzo lo completa l\'ufficio)', () => {
    expect(validaManualeClient({
      anagrafica: { matricola: '202015276676' }, campiTemplate: [], slotFotoPresenti: {}, committente: 'lim_massive',
    }).ok).toBe(true);
  });
  it('committente ordinario: il messaggio continua a chiedere anche l\'indirizzo', () => {
    const r = validaManualeClient({ anagrafica: { pdr: '123' }, campiTemplate: campi, slotFotoPresenti: {}, committente: 'italgas' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/indirizzo/i);
  });
});

// AcquaLatina: la modale si ferma all'anagrafica e non raccoglie foto. Preteserle qui bloccherebbe
// l'invio con un errore che dal telefono non si può togliere.
describe('validaManualeClient — committenti "solo richiesta"', () => {
  it('acqualatina: nessuna foto pretesa, anche con un template che le dichiara obbligatorie', () => {
    expect(validaManualeClient({
      anagrafica: { matricola: 'AL26A0012345' },
      campiTemplate: campi,
      slotFotoPresenti: { foto_contatore: false },
      committente: 'acqualatina',
    }).ok).toBe(true);
  });
  it("acqualatina senza identificativo resta però respinta: l'anagrafica vale per tutti", () => {
    expect(validaManualeClient({
      anagrafica: {}, campiTemplate: campi, slotFotoPresenti: {}, committente: 'acqualatina',
    }).ok).toBe(false);
  });
  it('lim_massive, che NON è "solo richiesta", continua a esigere la foto obbligatoria', () => {
    expect(validaManualeClient({
      anagrafica: { matricola: '1' }, campiTemplate: campi, slotFotoPresenti: { foto_contatore: false }, committente: 'lim_massive',
    }).ok).toBe(false);
  });
});

// Questa funzione è nata come difesa contro i 422 al sync (design del 10/06/2026) ma per mesi
// non è stata chiamata da nessuno: esisteva il test, non l'uso. Una difesa che nessuno esegue è
// peggio di nessuna difesa, perché la si dà per attiva. La guardia fissa il collegamento.
describe('guardia: la modale la chiama davvero, prima di accodare', () => {
  const modale = readFileSync(
    join(process.cwd(), 'components', 'modules', 'rapportini', 'ModaleInterventoManuale.tsx'),
    'utf8',
  );

  it('importa e invoca validaManualeClient', () => {
    expect(modale).toMatch(/import \{ validaManualeClient \} from '@\/lib\/offline\/validateManuale'/);
    expect(modale).toMatch(/const pre = validaManualeClient\(\{/);
    expect(modale).toMatch(/if \(!pre\.ok\) \{/);
  });

  it("la chiama PRIMA di accodaManuale: dopo, l'elemento è già in coda e non torna indietro", () => {
    expect(modale.indexOf('validaManualeClient({')).toBeGreaterThan(-1);
    expect(modale.indexOf('validaManualeClient({')).toBeLessThan(modale.indexOf('await accodaManuale('));
  });
});
