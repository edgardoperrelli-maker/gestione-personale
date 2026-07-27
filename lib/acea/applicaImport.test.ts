import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applicaImport } from './applicaImport';
import { riconciliaImport } from './riconciliaImport';
import { rigaHash } from './rigaHash';
import type { RigaOrdineAcea } from './tipi';

// ─────────────────────────────────────────────────────────────────────────────
// Fake Supabase minimale: le sole operazioni usate da applicaImport
// (insert, update+eq, delete+eq, upsert). Registra le chiamate per le asserzioni.
// ─────────────────────────────────────────────────────────────────────────────
type Riga = Record<string, unknown>;

function fakeDb(opts: { falliscisu?: string } = {}) {
  const tabelle: Record<string, Riga[]> = {
    acea_ordini: [], acea_ordini_eventi: [], acea_impianti: [],
  };
  /** Builder chainable minimale, con i filtri catturati in chiusura (niente `this`). */
  function builder(tab: string) {
    const filtri: [string, unknown][] = [];
    const match = (r: Riga) => filtri.every(([c, v]) => r[c] === v);
    const conFiltri = <T>(esegui: () => T) => ({
      eq(c: string, v: unknown) { filtri.push([c, v]); return this; },
      then(res: (v: unknown) => void) { esegui(); res({ error: null }); },
    });
    return {
      eq(c: string, v: unknown) { filtri.push([c, v]); return this; },
      insert(rows: Riga | Riga[]) {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (opts.falliscisu === tab) {
          return { then: (res: (v: unknown) => void) => res({ error: { message: 'boom' } }) };
        }
        (tabelle[tab] ??= []).push(...arr.map((r) => ({ ...r })));
        return { then: (res: (v: unknown) => void) => res({ error: null }) };
      },
      upsert(rows: Riga[], o: { onConflict: string }) {
        const chiave = o.onConflict;
        for (const r of rows) {
          const i = (tabelle[tab] ??= []).findIndex((x) => x[chiave] === r[chiave]);
          if (i >= 0) tabelle[tab][i] = { ...tabelle[tab][i], ...r };
          else tabelle[tab].push({ ...r });
        }
        return { then: (res: (v: unknown) => void) => res({ error: null }) };
      },
      update(patch: Riga) {
        return conFiltri(() => {
          for (const r of tabelle[tab] ?? []) if (match(r)) Object.assign(r, patch);
        });
      },
      delete() {
        return conFiltri(() => {
          tabelle[tab] = (tabelle[tab] ?? []).filter((r) => !match(r));
        });
      },
    };
  }
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient;
  return { db, tabelle };
}

const riga = (over: Partial<RigaOrdineAcea> = {}): RigaOrdineAcea => {
  const r = {
    odl: '912215286', numero_operazione: '0010', contratto: '3600002158', fornitore: '25617',
    tipo_ordine: 'ASTR', famiglia: 'massive' as const, denominazione: null,
    attivita: 'Limitazione Massiva su Impianto', chiave_testo: null, testo_ordine: null,
    stato: 'DAPI', stato_desc: null, aperto: true,
    data_creazione: '2026-05-25', cardine_dal: null, cardine_al: null,
    data_completamento: null, chiusura_tecnica: null, scadenza: null,
    cid: null, operatore_cognome: null, operatore_nome: null,
    causale: null, causale_desc: null, esito_positivo: null, testo_conferma: null,
    via: 'VIA ALFA', civico: '108', cap: '00139', comune: 'ZAGAROLO', provincia: 'RM',
    frazione: null, sede_tecnica: null, sede_tecnica_desc: null,
    impianto: '4003635716', matricola: '201215053510', matricola_norm: '201215053510',
    origine_misuratore: 'testo' as const, sospetto_troncamento: false,
    valore_netto: 25.46, documento_acquisto: null, posizione_documento: null,
    documento_chiusura: null, wbs: null, escludi_consuntivazione: false,
    odm_riferimento: null, odm_operazione_riferimento: null,
    codice_sla: 'NSLA', priorita: null, priorita_testo: null,
    centro_lavoro: null, tam: null, direttore_operativo: null,
    avviso: null, codice_accesso: null, riga_hash: '',
    ...over,
  } as RigaOrdineAcea;
  r.riga_hash = rigaHash(r);
  return r;
};

const IMPORT_ID = '11111111-1111-1111-1111-111111111111';

describe('applicaImport — inserimenti', () => {
  it('inserisce le righe nuove marcandole con l\'import', async () => {
    const { db, tabelle } = fakeDb();
    const piano = riconciliaImport({ dalFile: [riga()], esistenti: [] });
    const e = await applicaImport(db, piano, IMPORT_ID);
    expect(e.errore).toBeUndefined();
    expect(e.inserite).toBe(1);
    expect(tabelle.acea_ordini).toHaveLength(1);
    expect(tabelle.acea_ordini[0].import_id).toBe(IMPORT_ID);
    expect(tabelle.acea_ordini[0].odl).toBe('912215286');
  });

  it('registra un evento "creato" per ogni riga nuova', async () => {
    const { db, tabelle } = fakeDb();
    const piano = riconciliaImport({ dalFile: [riga({ odl: 'A' }), riga({ odl: 'B' })], esistenti: [] });
    await applicaImport(db, piano, IMPORT_ID);
    expect(tabelle.acea_ordini_eventi.filter((e) => e.tipo === 'creato')).toHaveLength(2);
  });
});

describe('applicaImport — aggiornamenti', () => {
  it('aggiorna la riga esistente e registra un evento per ogni campo cambiato', async () => {
    const { db, tabelle } = fakeDb();
    const prima = riga({ stato: 'DAPI', aperto: true });
    tabelle.acea_ordini.push({ ...prima });
    const dopo = riga({ stato: 'COMP', aperto: false, causale: 'EIES' });
    const piano = riconciliaImport({ dalFile: [dopo], esistenti: [prima] });
    const e = await applicaImport(db, piano, IMPORT_ID);

    expect(e.aggiornate).toBe(1);
    expect(tabelle.acea_ordini[0].stato).toBe('COMP');
    expect(tabelle.acea_ordini[0].aperto).toBe(false);
    const modifiche = tabelle.acea_ordini_eventi.filter((x) => x.tipo === 'modificato');
    expect(modifiche.map((m) => m.campo).sort()).toEqual(['aperto', 'causale', 'stato']);
    const cambioStato = modifiche.find((m) => m.campo === 'stato');
    expect(cambioStato).toMatchObject({ valore_prima: 'DAPI', valore_dopo: 'COMP' });
  });

  it('non tocca nulla quando la riga è invariata', async () => {
    const { db, tabelle } = fakeDb();
    const r = riga();
    tabelle.acea_ordini.push({ ...r, import_id: 'vecchio' });
    const piano = riconciliaImport({ dalFile: [r], esistenti: [r] });
    const e = await applicaImport(db, piano, IMPORT_ID);
    expect(e).toMatchObject({ inserite: 0, aggiornate: 0, eliminate: 0 });
    // nemmeno l'import_id viene riscritto: "modificato" deve voler dire davvero modificato
    expect(tabelle.acea_ordini[0].import_id).toBe('vecchio');
    expect(tabelle.acea_ordini_eventi).toHaveLength(0);
  });
});

describe('applicaImport — annullati', () => {
  it('elimina dal registro e registra l\'evento', async () => {
    const { db, tabelle } = fakeDb();
    tabelle.acea_ordini.push({ ...riga({ stato: 'DAPI' }) });
    const piano = riconciliaImport({
      dalFile: [riga({ stato: 'ANNL', aperto: false })],
      esistenti: [riga({ stato: 'DAPI' })],
    });
    const e = await applicaImport(db, piano, IMPORT_ID);
    expect(e.eliminate).toBe(1);
    expect(tabelle.acea_ordini).toHaveLength(0);
    expect(tabelle.acea_ordini_eventi.filter((x) => x.tipo === 'annullato')).toHaveLength(1);
  });

  it('elimina solo l\'operazione annullata, non l\'intero ordine', async () => {
    // Chiave composta: annullare 0040 non deve portarsi via 0050 dello stesso ODL.
    const { db, tabelle } = fakeDb();
    tabelle.acea_ordini.push({ ...riga({ odl: '956868342', numero_operazione: '0040' }) });
    tabelle.acea_ordini.push({ ...riga({ odl: '956868342', numero_operazione: '0050' }) });
    const piano = riconciliaImport({
      dalFile: [
        riga({ odl: '956868342', numero_operazione: '0040', stato: 'ANNL', aperto: false }),
        riga({ odl: '956868342', numero_operazione: '0050' }),
      ],
      esistenti: [
        riga({ odl: '956868342', numero_operazione: '0040' }),
        riga({ odl: '956868342', numero_operazione: '0050' }),
      ],
    });
    await applicaImport(db, piano, IMPORT_ID);
    expect(tabelle.acea_ordini).toHaveLength(1);
    expect(tabelle.acea_ordini[0].numero_operazione).toBe('0050');
  });
});

describe('applicaImport — anagrafica impianti', () => {
  it('crea l\'impianto con i soli campi ACEA', async () => {
    const { db, tabelle } = fakeDb();
    const piano = riconciliaImport({ dalFile: [riga()], esistenti: [] });
    await applicaImport(db, piano, IMPORT_ID);
    expect(tabelle.acea_impianti).toHaveLength(1);
    expect(tabelle.acea_impianti[0]).toMatchObject({
      impianto: '4003635716', matricola: '201215053510', comune: 'ZAGAROLO', via_acea: 'VIA ALFA',
    });
    // le colonne dell'ufficio non vengono mai scritte dall'import
    expect(tabelle.acea_impianti[0].indirizzo_verificato).toBeUndefined();
  });

  it('NON sovrascrive l\'indirizzo verificato dall\'ufficio', async () => {
    const { db, tabelle } = fakeDb();
    tabelle.acea_impianti.push({
      impianto: '4003635716', via_acea: 'VIA ALFA',
      indirizzo_verificato: 'VIA BETA 12', verificato_da: 's1',
    });
    const piano = riconciliaImport({ dalFile: [riga({ via: 'VIA GAMMA' })], esistenti: [] });
    await applicaImport(db, piano, IMPORT_ID);
    const imp = tabelle.acea_impianti[0];
    expect(imp.via_acea).toBe('VIA GAMMA');                 // il dato ACEA si aggiorna
    expect(imp.indirizzo_verificato).toBe('VIA BETA 12');   // la correzione resta
    expect(imp.verificato_da).toBe('s1');
  });

  it('deduplica gli impianti ripetuti nello stesso import', async () => {
    const { db, tabelle } = fakeDb();
    const piano = riconciliaImport({
      dalFile: [riga({ odl: 'A' }), riga({ odl: 'B' })], // stesso impianto
      esistenti: [],
    });
    await applicaImport(db, piano, IMPORT_ID);
    expect(tabelle.acea_impianti).toHaveLength(1);
  });

  it('salta le righe senza impianto (rimozioni allacci abusivi)', async () => {
    const { db, tabelle } = fakeDb();
    const piano = riconciliaImport({
      dalFile: [riga({ impianto: null, matricola: null })],
      esistenti: [],
    });
    await applicaImport(db, piano, IMPORT_ID);
    expect(tabelle.acea_impianti).toHaveLength(0);
    expect(tabelle.acea_ordini).toHaveLength(1); // la riga entra comunque nel registro
  });
});

describe('applicaImport — errori', () => {
  it('riporta l\'errore senza lanciare', async () => {
    const { db } = fakeDb({ falliscisu: 'acea_ordini' });
    const piano = riconciliaImport({ dalFile: [riga()], esistenti: [] });
    const e = await applicaImport(db, piano, IMPORT_ID);
    expect(e.errore).toMatch(/inserimento: boom/);
    expect(e.inserite).toBe(0);
  });
});
