// Le foto obbligatorie di un "+" operatore: il server non può pretendere più di quanto la modale
// abbia mostrato, o la pratica resta bloccata in coda per sempre.
//
// Caso reale (07/08/2026, rapportino ACEA): due template descrivono la STESSA foto con chiavi
// diverse — il modello del "+" «TEMPLATE MANUALI LIM MASSIVE» la chiama `sostituzione_valvola`,
// il flusso «RAPPORTINO LIMITAZIONI MASSIVE» la chiama `sost_valvola`. Con «SOSTITUZIONE VALVOLA
// = SI» la regola condizionale scatta su entrambi, ma la foto parte dal telefono con la chiave
// del client: il server, che validava sul flusso, chiedeva uno slot mai esistito. 12 invii, 12
// volte 422, e nel cassetto solo «Rimuovi».
//
// Qui si provano le funzioni che la route CHIAMA davvero (campiGateFoto / campiEsonero), non una
// loro riscrittura: una copia locale della regola proverebbe soltanto sé stessa.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { campiFoto, validaFotoObbligatorie } from './validaFotoObbligatorie';
import { campiGateFoto, campiEsonero } from './gateFotoManuale';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';

/** Modello del "+" per lim_massive (solo_manuale): l'override che la modale rende in campo. */
const TEMPLATE_PIU: TemplateCampo[] = [
  { chiave: 'sostituzione_valvola', etichetta: 'SOSTITUZIONE VALVOLA', tipo: 'select', opzioni: ['SI'], ordine: 1 },
  { chiave: 'note', etichetta: 'NOTE', tipo: 'testo', ordine: 2 },
  { chiave: 'sigillo', etichetta: 'SIGILLO', tipo: 'testo', obbligatoria: true, ordine: 3 },
  { chiave: 'ante_panoramica', etichetta: 'ANTE PANORAMICA', tipo: 'foto', obbligatoria: true, ordine: 4 },
  { chiave: 'inserimento_limitazione', etichetta: 'INSERIMENTO LIMITAZIONE', tipo: 'foto', obbligatoria: true, ordine: 5 },
  { chiave: 'lettura_misuratore', etichetta: 'LETTURA MISURATORE', tipo: 'foto', obbligatoria: true, ordine: 6 },
  { chiave: 'sigillatura', etichetta: 'SIGILLATURA', tipo: 'foto', obbligatoria: true, ordine: 7 },
  // La valvola non è obbligatoria di suo: lo diventa solo su «= SI».
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

/** Ricalca la mappa `presenti` costruita dalla route sugli slot del cancello. */
const presenti = (campi: TemplateCampo[], ricevute: Set<string> = RICEVUTE): Record<string, boolean> =>
  Object.fromEntries(campiFoto(campi).map((c) => [c.chiave, ricevute.has(c.chiave)]));

/** L'esito che la route calcola: esonero sull'unione, obbligo sul cancello. */
function esitoRoute(
  committente: string,
  override: TemplateCampo[],
  standard: TemplateCampo[],
  effettivi: TemplateCampo[],
  risposte: Record<string, unknown>,
  ricevute: Set<string> = RICEVUTE,
) {
  const gate = campiGateFoto(committente, override, standard);
  return haEsitoNegativo(risposte, campiEsonero(gate, effettivi))
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(gate, presenti(gate, ricevute), risposte);
}

/** Nessuna foto spedita: è il caso dell'esito negativo, dove la modale non le chiede. */
const NESSUNA = new Set<string>();

const RISPOSTE = { sostituzione_valvola: 'SI', sigillo: 'A1234' };

describe('chiavi divergenti fra modello del "+" e flusso', () => {
  it('la foto della valvola, spedita con la chiave del modello, viene riconosciuta', () => {
    expect(esitoRoute('lim_massive', TEMPLATE_PIU, TEMPLATE_FLUSSO, TEMPLATE_FLUSSO, RISPOSTE))
      .toEqual({ ok: true, mancanti: [] });
  });

  it('validare sul flusso invece darebbe la stessa spedizione per mancante: è il 422 senza uscita', () => {
    const esito = validaFotoObbligatorie(TEMPLATE_FLUSSO, presenti(TEMPLATE_FLUSSO), RISPOSTE);
    expect(esito.ok).toBe(false);
    expect(esito.mancanti).toContain('SOST. VALVOLA');
  });

  it("senza «= SI» la valvola non è obbligatoria: è perché gli altri «+» di quel giorno passavano", () => {
    const senzaValvola = { sigillo: 'A1234' };
    expect(esitoRoute('lim_massive', TEMPLATE_PIU, TEMPLATE_FLUSSO, TEMPLATE_FLUSSO, senzaValvola).ok).toBe(true);
  });
});

// AcquaLatina non ha un modello "+" proprio (nessun template con `committente = 'acqualatina'`):
// eredita quello del RAPPORTINO. Su un rapportino con foto obbligatorie — «RAPPORTINO LIMITAZIONI
// MASSIVE» e «RESINE» ne hanno 4 a testa — il cancello chiederebbe foto a un flusso che si ferma
// all'anagrafica e non ne raccoglie nessuna.
describe('committenti "solo richiesta": il cancello resta vuoto', () => {
  it('acqualatina su un rapportino con 4 foto obbligatorie: la richiesta passa', () => {
    expect(campiGateFoto('acqualatina', [], TEMPLATE_FLUSSO)).toEqual([]);
    expect(esitoRoute('acqualatina', [], TEMPLATE_FLUSSO, TEMPLATE_FLUSSO, {})).toEqual({ ok: true, mancanti: [] });
  });

  it('lim_massive sullo stesso rapportino resta soggetto agli obblighi', () => {
    expect(esitoRoute('lim_massive', TEMPLATE_PIU, TEMPLATE_FLUSSO, TEMPLATE_FLUSSO, {}, NESSUNA).ok).toBe(false);
  });
});

// REGRESSIONE (revisione del 07/08/2026): spostando il cancello sul modello ma lasciando
// l'esonero sul flusso, il client toglieva l'obbligo e il server lo teneva. Succede quando
// l'`eseguito` sta nel modello e NON nel flusso — configurazione reale: committente «Altro» su un
// rapportino «RAPPORTINO LIMITAZIONI MASSIVE» con un'attività il cui flusso (es. «P.I.») non ha
// campi esito. Il client mostrava «Invia» abilitato con zero foto, il server rispondeva 422.
describe('esito negativo: l\'esonero vale anche se il flusso non conosce il campo', () => {
  const FLUSSO_SENZA_ESEGUITO: TemplateCampo[] = [
    { chiave: 'ora_arrivo', etichetta: 'ORA ARRIVO', tipo: 'testo', ordine: 1 },
  ];
  const NEGATIVO = { eseguito: 'NESSUN PASSAGGIO' };

  it('il client esonera, e ora anche il server: zero foto spedite, richiesta accettata', () => {
    // Il client valuta sulla lista che ha reso: il cancello.
    const gate = campiGateFoto('altro', [], TEMPLATE_FLUSSO);
    expect(haEsitoNegativo(NEGATIVO, gate)).toBe(true);
    // Il server, sull'unione, arriva alla stessa conclusione.
    expect(esitoRoute('altro', [], TEMPLATE_FLUSSO, FLUSSO_SENZA_ESEGUITO, NEGATIVO, NESSUNA))
      .toEqual({ ok: true, mancanti: [] });
  });

  it('sul solo flusso l\'esonero si perdeva, e nascevano 4 foto impossibili da consegnare', () => {
    expect(haEsitoNegativo(NEGATIVO, FLUSSO_SENZA_ESEGUITO)).toBe(false);
    const soloFlusso = validaFotoObbligatorie(TEMPLATE_FLUSSO, presenti(TEMPLATE_FLUSSO, NESSUNA), NEGATIVO);
    expect(soloFlusso.ok).toBe(false);
    expect(soloFlusso.mancanti).toHaveLength(4);
  });

  it('un esito POSITIVO senza foto resta respinto: l\'esonero non è una scorciatoia', () => {
    expect(esitoRoute('altro', [], TEMPLATE_FLUSSO, FLUSSO_SENZA_ESEGUITO, { eseguito: 'SI' }, NESSUNA).ok).toBe(false);
  });
});

describe('campiEsonero', () => {
  it('unisce cancello e flusso, col cancello davanti', () => {
    expect(campiEsonero(TEMPLATE_PIU, TEMPLATE_FLUSSO)).toEqual([...TEMPLATE_PIU, ...TEMPLATE_FLUSSO]);
  });
  it('regge liste assenti', () => {
    expect(campiEsonero(null, undefined)).toEqual([]);
  });
});

describe('guardia: la route usa le funzioni condivise, non una regola propria', () => {
  const sorgente = readFileSync(
    join(process.cwd(), 'app', 'api', 'r', '[token]', 'intervento-manuale', 'route.ts'),
    'utf8',
  );

  it('costruisce il cancello con campiGateFoto', () => {
    expect(sorgente).toMatch(/const campiGate = campiGateFoto\(committente, overrideCampi, standardCampi\)/);
    expect(sorgente).toMatch(/const slotFoto = campiFoto\(campiGate\)/);
  });

  it('valida gli obblighi sul cancello e l\'esonero sull\'unione, mai sui soli campiEffettivi', () => {
    expect(sorgente).toMatch(/haEsitoNegativo\(dati\.risposte, campiEsonero\(campiGate, campiEffettivi\)\)/);
    expect(sorgente).toMatch(/validaFotoObbligatorie\(campiGate,/);
    expect(sorgente).not.toMatch(/haEsitoNegativo\(dati\.risposte, campiEffettivi\)/);
    expect(sorgente).not.toMatch(/validaFotoObbligatorie\(campiEffettivi/);
  });

  it('risolve le etichette delle foto ricevute partendo dal cancello', () => {
    expect(sorgente).toMatch(/etichettaSlotFoto\(chiave, campiEtichettaFoto\(campiGate, campiEffettivi\)\)/);
  });
});
