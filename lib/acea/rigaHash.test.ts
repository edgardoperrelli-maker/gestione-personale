import { describe, it, expect } from 'vitest';
import { rigaHash, VERSIONE_REGOLE, CAMPI_HASH } from './rigaHash';
import type { RigaOrdineAcea } from './tipi';

const base = (over: Partial<RigaOrdineAcea> = {}): RigaOrdineAcea => ({
  odl: '912215286', numero_operazione: '0010',
  contratto: '3600002158', fornitore: '25617',
  tipo_ordine: 'ASTR', famiglia: 'massive', denominazione: 'Manutenzione Straordinaria',
  attivita: 'Limitazione Massiva su Impianto', chiave_testo: 'AUCHIFO',
  testo_ordine: '4003635716_LIM_MAS_MATR_201215053510_LEN',
  stato: 'DAPI', stato_desc: 'Intervento Richiesto', aperto: true,
  data_creazione: '2026-05-25', cardine_dal: '2026-05-22', cardine_al: '2026-10-30',
  data_completamento: null, chiusura_tecnica: null, scadenza: null,
  cid: null, operatore_cognome: null, operatore_nome: null,
  causale: null, causale_desc: null, esito_positivo: null, testo_conferma: null,
  via: 'VIA ALFA', civico: '108', cap: '00139', comune: 'ZAGAROLO', provincia: 'RM',
  frazione: null, sede_tecnica: 'AZAGID001_00', sede_tecnica_desc: 'Rete Dis.ZAGAROLO 001_00',
  impianto: '4003635716', matricola: '201215053510', matricola_norm: '201215053510',
  origine_misuratore: 'testo', sospetto_troncamento: false,
  valore_netto: 25.46, documento_acquisto: '4206329130', posizione_documento: '00010',
  documento_chiusura: null, wbs: 'AAT2-EGU02-ROMAS630', escludi_consuntivazione: false,
  odm_riferimento: null, odm_operazione_riferimento: null,
  codice_sla: 'NSLA', priorita: '1', priorita_testo: 'Priorità Standard',
  centro_lavoro: 'A2ODIS01', tam: 'ALX', direttore_operativo: 'ROSSI MARIO',
  avviso: null, codice_accesso: null,
  riga_hash: '',
  ...over,
});

describe('rigaHash', () => {
  it('è deterministico: stessa riga → stesso hash', () => {
    expect(rigaHash(base())).toBe(rigaHash(base()));
  });

  it('cambia se cambia un campo ACEA', () => {
    const h = rigaHash(base());
    expect(rigaHash(base({ stato: 'COMP' }))).not.toBe(h);
    expect(rigaHash(base({ operatore_cognome: 'BIANCHI' }))).not.toBe(h);
    expect(rigaHash(base({ valore_netto: 91.12 }))).not.toBe(h);
    expect(rigaHash(base({ causale: 'EIES' }))).not.toBe(h);
  });

  it('NON cambia se cambia solo il campo hash stesso', () => {
    // Evita la dipendenza circolare: l'hash non entra nel proprio calcolo.
    expect(rigaHash(base({ riga_hash: 'qualsiasi' }))).toBe(rigaHash(base({ riga_hash: 'altro' })));
  });

  it('distingue null da stringa vuota', () => {
    // "campo assente" e "campo presente ma vuoto" sono stati diversi lato ACEA.
    expect(rigaHash(base({ testo_conferma: null }))).not.toBe(rigaHash(base({ testo_conferma: '' })));
  });

  it('include i derivati: cambiare la regola di scadenza deve forzare il ricalcolo', () => {
    expect(CAMPI_HASH).toContain('scadenza');
    expect(CAMPI_HASH).toContain('famiglia');
    expect(rigaHash(base({ scadenza: '2026-06-08' }))).not.toBe(rigaHash(base({ scadenza: null })));
  });

  it('la versione delle regole entra nell\'hash', () => {
    // Se domani la soglia dunning passa da 14 a 10 giorni, i campi ACEA grezzi non cambiano:
    // senza la versione nel digest, l'import salterebbe tutte le righe come "invariate" e le
    // scadenze resterebbero quelle vecchie per sempre.
    const h1 = rigaHash(base(), 1);
    const h2 = rigaHash(base(), 2);
    expect(h1).not.toBe(h2);
    expect(rigaHash(base())).toBe(rigaHash(base(), VERSIONE_REGOLE));
  });

  it('produce un digest esadecimale di 64 caratteri', () => {
    expect(rigaHash(base())).toMatch(/^[0-9a-f]{64}$/);
  });
});
