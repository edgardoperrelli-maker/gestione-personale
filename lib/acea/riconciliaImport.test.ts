import { describe, it, expect } from 'vitest';
import { riconciliaImport, chiaveOrdine } from './riconciliaImport';
import { rigaHash } from './rigaHash';
import type { RigaOrdineAcea } from './tipi';

const riga = (over: Partial<RigaOrdineAcea> = {}): RigaOrdineAcea => {
  const r: RigaOrdineAcea = {
    odl: '912215286', numero_operazione: '0010',
    contratto: '3600002158', fornitore: '25617',
    tipo_ordine: 'ASTR', famiglia: 'massive', denominazione: 'Manutenzione Straordinaria',
    attivita: 'Limitazione Massiva su Impianto', chiave_testo: 'AUCHIFO',
    testo_ordine: '4003635716_LIM_MAS_MATR_201215053510_LEN',
    stato: 'DAPI', stato_desc: 'Intervento Richiesto', aperto: true,
    data_creazione: '2026-05-25', cardine_dal: null, cardine_al: '2026-10-30',
    data_completamento: null, chiusura_tecnica: null, scadenza: null,
    cid: null, operatore_cognome: null, operatore_nome: null,
    causale: null, causale_desc: null, esito_positivo: null, testo_conferma: null,
    via: 'VIA ALFA', civico: '108', cap: '00139', comune: 'ZAGAROLO', provincia: 'RM',
    frazione: null, sede_tecnica: null, sede_tecnica_desc: null,
    impianto: '4003635716', matricola: '201215053510', matricola_norm: '201215053510',
    origine_misuratore: 'testo', sospetto_troncamento: false,
    valore_netto: 25.46, documento_acquisto: null, posizione_documento: null,
    documento_chiusura: null, wbs: null, escludi_consuntivazione: false,
    odm_riferimento: null, odm_operazione_riferimento: null,
    codice_sla: 'NSLA', priorita: null, priorita_testo: null,
    centro_lavoro: null, tam: null, direttore_operativo: null,
    avviso: null, codice_accesso: null,
    riga_hash: '',
    ...over,
  };
  r.riga_hash = rigaHash(r);
  return r;
};

describe('chiaveOrdine', () => {
  it('è la coppia odl + numero operazione', () => {
    expect(chiaveOrdine(riga({ odl: '1', numero_operazione: '0010' }))).toBe('1|0010');
    // due operazioni dello stesso ordine sono righe DIVERSE
    expect(chiaveOrdine(riga({ odl: '1', numero_operazione: '0010' })))
      .not.toBe(chiaveOrdine(riga({ odl: '1', numero_operazione: '0020' })));
  });
});

describe('riconciliaImport — riga nuova', () => {
  it('una chiave assente dal registro è nuova', () => {
    const p = riconciliaImport({ dalFile: [riga()], esistenti: [] });
    expect(p.nuove).toHaveLength(1);
    expect(p.modificate).toHaveLength(0);
    expect(p.invariate).toBe(0);
  });

  it('due operazioni dello stesso ordine entrano entrambe', () => {
    const p = riconciliaImport({
      dalFile: [riga({ numero_operazione: '0040' }), riga({ numero_operazione: '0050' })],
      esistenti: [],
    });
    expect(p.nuove).toHaveLength(2);
  });
});

describe('riconciliaImport — riga identica', () => {
  it('stesso hash → invariata, nessuna scrittura', () => {
    const r = riga();
    const p = riconciliaImport({ dalFile: [r], esistenti: [r] });
    expect(p.invariate).toBe(1);
    expect(p.nuove).toHaveLength(0);
    expect(p.modificate).toHaveLength(0);
    expect(p.daEliminare).toHaveLength(0);
  });

  it('due import consecutivi dello stesso file non producono scritture', () => {
    const file = [riga({ odl: 'A' }), riga({ odl: 'B' }), riga({ odl: 'C' })];
    const p = riconciliaImport({ dalFile: file, esistenti: file });
    expect(p.invariate).toBe(3);
    expect(p.nuove.length + p.modificate.length + p.daEliminare.length).toBe(0);
  });
});

describe('riconciliaImport — riga modificata', () => {
  it('hash diverso → modificata, con l\'elenco dei campi cambiati', () => {
    const prima = riga({ stato: 'DAPI', aperto: true, operatore_cognome: null });
    const dopo = riga({ stato: 'COMP', aperto: false, operatore_cognome: 'ROSSI' });
    const p = riconciliaImport({ dalFile: [dopo], esistenti: [prima] });
    expect(p.modificate).toHaveLength(1);
    const campi = p.modificate[0].cambi.map((c) => c.campo).sort();
    expect(campi).toEqual(['aperto', 'operatore_cognome', 'stato']);
    const statoCambio = p.modificate[0].cambi.find((c) => c.campo === 'stato');
    expect(statoCambio).toEqual({ campo: 'stato', prima: 'DAPI', dopo: 'COMP' });
  });

  it('registra il passaggio da null a valore e viceversa', () => {
    const p = riconciliaImport({
      dalFile: [riga({ causale: 'EIES' })],
      esistenti: [riga({ causale: null })],
    });
    expect(p.modificate[0].cambi).toEqual([{ campo: 'causale', prima: null, dopo: 'EIES' }]);
  });
});

describe('riconciliaImport — annullati', () => {
  it('un ANNL presente nel registro va eliminato', () => {
    const p = riconciliaImport({
      dalFile: [riga({ stato: 'ANNL', aperto: false })],
      esistenti: [riga({ stato: 'DAPI' })],
    });
    expect(p.daEliminare).toEqual([{ odl: '912215286', numero_operazione: '0010' }]);
    expect(p.nuove).toHaveLength(0);
    expect(p.modificate).toHaveLength(0);
  });

  it('un ANNL non ancora in registro NON viene inserito', () => {
    // Decisione 10: gli annullati non devono mai entrare nel DB.
    const p = riconciliaImport({ dalFile: [riga({ stato: 'ANNL', aperto: false })], esistenti: [] });
    expect(p.nuove).toHaveLength(0);
    expect(p.daEliminare).toHaveLength(0);
    expect(p.invariate).toBe(0);
  });

  it('segnala gli annullati che erano pianificati, invece di cancellarli in silenzio', () => {
    const p = riconciliaImport({
      dalFile: [riga({ stato: 'ANNL', aperto: false })],
      esistenti: [riga({ stato: 'ASGN' })],
      pianificati: [{ odl: '912215286', numero_operazione: '0010', data: '2026-07-27', operatore: 'CIARALLO' }],
    });
    expect(p.annullatiPianificati).toEqual([
      { odl: '912215286', numero_operazione: '0010', data: '2026-07-27', operatore: 'CIARALLO' },
    ]);
  });

  it('un annullato senza intervento collegato non finisce fra i segnalati', () => {
    const p = riconciliaImport({
      dalFile: [riga({ stato: 'ANNL', aperto: false })],
      esistenti: [riga({ stato: 'DAPI' })],
      pianificati: [],
    });
    expect(p.daEliminare).toHaveLength(1);
    expect(p.annullatiPianificati).toHaveLength(0);
  });
});

describe('riconciliaImport — assenza dal file', () => {
  it('una riga in registro assente dal file NON viene toccata', () => {
    // Protezione contro il filtro "Data pubblicazione ≥" sbagliato: l'assenza non cancella nulla.
    const p = riconciliaImport({
      dalFile: [riga({ odl: 'A' })],
      esistenti: [riga({ odl: 'A' }), riga({ odl: 'VECCHIO' })],
    });
    expect(p.daEliminare).toHaveLength(0);
    expect(p.nonCoperte).toBe(1);
    expect(p.invariate).toBe(1);
  });
});

describe('riconciliaImport — riepilogo', () => {
  it('i conteggi coprono tutte le righe del file', () => {
    const p = riconciliaImport({
      dalFile: [
        riga({ odl: 'NUOVA' }),
        riga({ odl: 'UGUALE' }),
        riga({ odl: 'CAMBIATA', stato: 'COMP' }),
        riga({ odl: 'ANNULLATA', stato: 'ANNL' }),
      ],
      esistenti: [
        riga({ odl: 'UGUALE' }),
        riga({ odl: 'CAMBIATA', stato: 'DAPI' }),
        riga({ odl: 'ANNULLATA', stato: 'DAPI' }),
        riga({ odl: 'FUORI-FINESTRA' }),
      ],
    });
    expect(p.nuove).toHaveLength(1);
    expect(p.invariate).toBe(1);
    expect(p.modificate).toHaveLength(1);
    expect(p.daEliminare).toHaveLength(1);
    expect(p.nonCoperte).toBe(1);
    expect(p.nuove.length + p.invariate + p.modificate.length + p.daEliminare.length).toBe(4);
  });
});
