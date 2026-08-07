// Il "cancello" delle foto obbligatorie del "+" operatore deve guardare gli stessi campi che
// la modale ha mostrato in campo, non il flusso del gruppo.
//
// Caso reale (07/08/2026, TREGU DANIEL, rapportino ACEA): due template descrivono la STESSA
// foto con chiavi diverse — il modello del "+" «TEMPLATE MANUALI LIM MASSIVE» la chiama
// `sostituzione_valvola`, il flusso «RAPPORTINO LIMITAZIONI MASSIVE» la chiama `sost_valvola`.
// Con «SOSTITUZIONE VALVOLA = SI» la regola condizionale scatta su entrambi, ma la foto parte
// dal telefono con la chiave del client: il server, che validava sul flusso, chiedeva uno slot
// mai esistito sul telefono. Risultato: 12 invii, 12 volte 422, la pratica bloccata in coda e
// nessun modo di rimediare dal campo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiFoto, validaFotoObbligatorie } from './validaFotoObbligatorie';
import { risolviCampiManuali } from './risolviCampiManuali';

/** Modello del "+" per lim_massive (solo_manuale): è quello che la modale usa come override. */
const TEMPLATE_PIU: TemplateCampo[] = [
  { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI'], ordine: 1 },
  { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 2 },
  { chiave: 'sigillo', etichetta: 'SIGILLO', tipo: 'testo', obbligatoria: true, ordine: 3 },
  { chiave: 'ante_panoramica', etichetta: 'ANTE PANORAMICA', tipo: 'foto', obbligatoria: true, ordine: 4 },
  { chiave: 'inserimento_limitazione', etichetta: 'INSERIMENTO LIMITAZIONE', tipo: 'foto', obbligatoria: true, ordine: 5 },
  { chiave: 'lettura_misuratore', etichetta: 'LETTURA MISURATORE', tipo: 'foto', obbligatoria: true, ordine: 6 },
  { chiave: 'sigillatura', etichetta: 'SIGILLATURA', tipo: 'foto', obbligatoria: true, ordine: 7 },
  // La valvola NON è obbligatoria di suo: lo diventa solo su «= SI».
  { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'foto', ordine: 8 },
];

/** Flusso del gruppo LIMITAZIONI MASSIVE: stessa foto, chiave DIVERSA (`sost_valvola`). */
const TEMPLATE_FLUSSO: TemplateCampo[] = [
  { chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', opzioni: ['SI', 'NESSUN PASSAGGIO', 'NO'], obbligatoria: true, ordine: 1 },
  { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true, ordine: 2 },
  { chiave: 'sigillo', etichetta: 'SIGILLO', tipo: 'testo', obbligatoria: true, ordine: 3 },
  { chiave: 'ante_panoramica', etichetta: 'ANTE PANORAMICA', tipo: 'foto', obbligatoria: true, ordine: 4 },
  { chiave: 'inserimento_limitazione', etichetta: 'INSERIMENTO LIMITAZIONE', tipo: 'foto', obbligatoria: true, ordine: 5 },
  { chiave: 'lettura_misuratore', etichetta: 'LETTURA MISURATORE', tipo: 'foto', obbligatoria: true, ordine: 6 },
  { chiave: 'sigillatura', etichetta: 'SIGILLATURA', tipo: 'foto', obbligatoria: true, ordine: 7 },
  { chiave: 'sost_valvola', etichetta: 'SOST. VALVOLA', tipo: 'foto', ordine: 8 },
];

/** Le chiavi foto che il telefono ha davvero spedito: quelle del modello del "+". */
const RICEVUTE = new Set([
  'ante_panoramica', 'inserimento_limitazione', 'lettura_misuratore', 'sigillatura', 'sostituzione_valvola',
]);

/** Riproduce la mappa `presenti` costruita dalla route sugli slot della lista passata. */
const presenti = (campi: TemplateCampo[]): Record<string, boolean> =>
  Object.fromEntries(campiFoto(campi).map((c) => [c.chiave, RICEVUTE.has(c.chiave)]));

const RISPOSTE = { sostituzione_valvola: 'SI', sigillo: 'A1234' };

describe('cancello foto del "+" — chiavi divergenti fra modello manuale e flusso', () => {
  it('sul modello che il campo ha visto, la foto della valvola risulta consegnata', () => {
    const campi = risolviCampiManuali(TEMPLATE_PIU, TEMPLATE_FLUSSO);
    expect(campi).toBe(TEMPLATE_PIU); // l'override valorizzato vince, come nella modale
    expect(validaFotoObbligatorie(campi, presenti(campi), RISPOSTE)).toEqual({ ok: true, mancanti: [] });
  });

  it('sul flusso, la stessa identica spedizione risulta invece mancante: è il 422 senza uscita', () => {
    const esito = validaFotoObbligatorie(TEMPLATE_FLUSSO, presenti(TEMPLATE_FLUSSO), RISPOSTE);
    expect(esito.ok).toBe(false);
    expect(esito.mancanti).toContain('SOST. VALVOLA');
  });

  it("senza «= SI» la valvola non è obbligatoria su nessuno dei due, ed è perché gli altri «+» passavano", () => {
    const senzaValvola = { sigillo: 'A1234' };
    expect(validaFotoObbligatorie(TEMPLATE_PIU, presenti(TEMPLATE_PIU), senzaValvola).ok).toBe(true);
    expect(validaFotoObbligatorie(TEMPLATE_FLUSSO, presenti(TEMPLATE_FLUSSO), senzaValvola).ok).toBe(true);
  });

  it('quando non c\'è override, il cancello resta lo standard del rapportino (nessuna divergenza)', () => {
    expect(risolviCampiManuali([], TEMPLATE_FLUSSO)).toBe(TEMPLATE_FLUSSO);
  });
});

describe('guardia: la route valida le foto sui campi del "+", non sul flusso', () => {
  const sorgente = readFileSync(
    join(process.cwd(), 'app', 'api', 'r', '[token]', 'intervento-manuale', 'route.ts'),
    'utf8',
  );

  it('costruisce il cancello dall\'eredità override→standard', () => {
    expect(sorgente).toMatch(/const campiGateFoto = risolviCampiManuali\(overrideCampi, standardCampi\)/);
    expect(sorgente).toMatch(/const slotFoto = campiFoto\(campiGateFoto\)/);
  });

  it('passa quel cancello a validaFotoObbligatorie, mai i campiEffettivi del flusso', () => {
    expect(sorgente).toMatch(/validaFotoObbligatorie\(campiGateFoto,/);
    expect(sorgente).not.toMatch(/validaFotoObbligatorie\(campiEffettivi/);
  });
});
