// lib/interventi/sincronizzaRapportini.test.ts
// Test del motore di (ri)generazione rapportini. Usa un fake Supabase client in-memory
// (chainable) e mocka ensureInterventiForPiano per isolare l'orchestrazione del motore.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/interventi/ensureInterventiForPiano', () => ({
  ensureInterventiForPiano: vi.fn(async () => ({ creati: 0, preservati: 0, scartati: 0 })),
}));

import { ensureInterventiForPiano } from '@/lib/interventi/ensureInterventiForPiano';
import { sincronizzaRapportini, isInterventoFkError } from './sincronizzaRapportini';
import { makeFakeDb, seedBase } from './testUtils/fakeSupabase';

const OPTS = { templateId: 'tpl1' };

describe('sincronizzaRapportini', () => {
  it('riusa lo stesso token per un operatore con rapportino esistente', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.rapportini[0].token).toBe('TOK1');
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.token).toBe('TOK1');
  });

  it('preserva le risposte già compilate per i task che restano', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', origine: 'task', risposte: { q: 'A' }, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce?.risposte).toEqual({ q: 'A' });
  });

  it('crea un nuovo token per un operatore senza rapportino', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's3', staff_name: 'Giovanni', tasks: [{ id: 't9', odl: 'ODL9' }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.rapportini[0].token).toBe('string');
    if (res.ok) expect(res.rapportini[0].token.length).toBeGreaterThan(0);
    expect(tables.rapportini.find((r) => r.staff_id === 's3')).toBeTruthy();
  });

  it('riapre un rapportino inviato SOLO con confermaInviati', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', confermaInviati: true });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('in_corso');
    expect(rap?.riaperto_at).toBeTruthy();
  });

  it('NON riapre un rapportino inviato senza conferma', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'inviato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const rap = tables.rapportini.find((r) => r.id === 'rap1');
    expect(rap?.stato).toBe('inviato');
    expect(rap?.riaperto_at).toBeFalsy();
  });

  it('rifiuta lo spostamento di un intervento completato (409)', async () => {
    // intervento ODL1 completato sotto s1, ma proposto sotto s2 → spostamento illecito
    const { db } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'completato' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(409);
      expect(res.error).toMatch(/^spostamento_completato:/);
    }
  });
});

describe('sincronizzaRapportini — ODL già positivi (invariante odlPositivi)', () => {
  it('non genera la voce per un ODL già eseguito positivo altrove e lo riporta in odlBloccati', async () => {
    vi.mocked(ensureInterventiForPiano).mockResolvedValueOnce({
      creati: 0, preservati: 0, scartati: 1, odlGiaPositivi: new Set(['odl1']), odlBloccati: ['ODL1'],
    });
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.odlBloccati).toEqual(['ODL1']);
    expect(tables.rapportino_voci.map((v) => v.task_id)).toEqual(['t2']);
  });

  it('stesso ODL due volte nel piano (import + template) → una sola voce', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'row-35', odl: 'ODL1' }, { id: 'tpl-1-0', odl: 'ODL1' }],
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    expect(tables.rapportino_voci.map((v) => v.task_id)).toEqual(['row-35']);
  });

  it('stesso ODL su DUE operatori del piano → la voce nasce solo per il primo', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [
        { piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 'a1', odl: 'DUP' }] },
        { piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 'b1', odl: 'DUP' }] },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    expect(tables.rapportino_voci.map((v) => v.task_id)).toEqual(['a1']);
  });

  it('la voce COMPILATA su ODL bloccato viene preservata in rigenerazione (mai cancellare lavoro)', async () => {
    vi.mocked(ensureInterventiForPiano).mockResolvedValueOnce({
      creati: 0, preservati: 0, scartati: 0, odlGiaPositivi: new Set(['odl1']), odlBloccati: [],
    });
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, origine: 'task', risposte: { eseguito: 'SI' }, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce?.risposte).toEqual({ eseguito: 'SI' });
  });
});

describe('isInterventoFkError', () => {
  it('riconosce la FK su rapportino_voci.intervento_id', () => {
    expect(isInterventoFkError('insert or update on table "rapportino_voci" violates foreign key constraint "rapportino_voci_intervento_id_fkey"')).toBe(true);
  });
  it('ignora altri errori e valori vuoti', () => {
    expect(isInterventoFkError('altro errore qualsiasi')).toBe(false);
    expect(isInterventoFkError(null)).toBe(false);
    expect(isInterventoFkError(undefined)).toBe(false);
  });
});

describe('sincronizzaRapportini — voce annullata', () => {
  it('un task annullato produce una voce con raw_json._annullato = true', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1', annullato: true }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1') as { annullato?: unknown; raw_json?: { _annullato?: boolean } } | undefined;
    expect(voce?.raw_json?._annullato).toBe(true);
    // Il flag vive SOLO in raw_json: 'annullato' non è una colonna di rapportino_voci (il DB reale la rifiuta).
    expect(voce?.annullato).toBeUndefined();
  });
});

describe('sincronizzaRapportini — preserva le voci manuali (dal +)', () => {
  it('una rigenerazione/salvataggio del piano NON cancella le voci manuali', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, origine: 'task', risposte: {}, raw_json: {} },
        { id: 'vman', rapportino_id: 'rap1', task_id: null, manuale: true, origine: 'manuale', approvazione_stato: 'in_attesa', richiesta_id: 'req1', risposte: { esito: 'OK' }, raw_json: { _nuovo: true } },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const manuale = tables.rapportino_voci.find((v) => v.id === 'vman');
    expect(manuale).toBeTruthy();                        // non cancellata
    expect(manuale?.risposte).toEqual({ esito: 'OK' });  // dati intatti
    expect(tables.rapportino_voci.filter((v) => v.task_id === 't1').length).toBe(1); // task ricostruito
  });
});

describe('sincronizzaRapportini — preserva le voci ACEA (modulo commessa)', () => {
  // Regola "un rapportino per operatore per giorno": il motore ACEA aggiunge le sue voci a un
  // rapportino nato da un piano Italgas. Rigenerare quel piano NON deve raderle via.
  it('una rigenerazione del piano NON cancella le voci origine=acea', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [
        { id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, origine: 'task', risposte: {}, raw_json: {} },
        { id: 'vacea', rapportino_id: 'rap1', task_id: 'acea-912215286', manuale: false, origine: 'acea', risposte: { esito: 'eseguito' }, raw_json: {} },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const acea = tables.rapportino_voci.find((v) => v.id === 'vacea');
    expect(acea).toBeTruthy();                              // sopravvissuta alla rigenerazione
    expect(acea?.risposte).toEqual({ esito: 'eseguito' });  // dati intatti
    expect(tables.rapportino_voci.filter((v) => v.task_id === 't1').length).toBe(1); // task ricostruito
  });
});

describe('sincronizzaRapportini — fallback FK su race', () => {
  const FK_MSG = 'violates foreign key constraint "rapportino_voci_intervento_id_fkey"';

  it('FK violation una volta → rilegge il piano e RIAGGANCIA (niente voce orfana)', async () => {
    // La race vera: gli interventi sono stati ricreati da una generazione concorrente. Rileggendo
    // lo stato fresco l'aggancio riesce — salvare a NULL avrebbe prodotto una voce orfana per
    // sempre (il caso 957327236: «SI» nello storico, intervento fermo ad assegnato).
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato' }],
    }), { failVociInsertOnce: FK_MSG });
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce).toBeTruthy();
    expect(voce?.intervento_id).toBe('i1');
  });

  it('FK violation anche al retry → ultima spiaggia: voci SENZA collegamento, ma niente 500', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato' }],
    }), { failVociInsertOnce: FK_MSG, failVociInsertTimes: 2 });
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voce = tables.rapportino_voci.find((v) => v.task_id === 't1');
    expect(voce).toBeTruthy();
    expect(voce?.intervento_id ?? null).toBeNull();
  });
});

describe('sincronizzaRapportini — skipInviati (sync automatico dal salvataggio del piano)', () => {
  const seedConRapportino = (stato: string) => seedBase({
    mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' }] }],
    rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato }],
    rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, origine: 'task', risposte: {}, raw_json: {} }],
  });

  it('con skipInviati NON tocca le voci di un rapportino inviato (il nuovo ODL non viene aggiunto)', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('inviato'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', skipInviati: true });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1']); // t2 NON aggiunto all'inviato
  });

  it('senza skipInviati ricostruisce le voci anche di un inviato (comportamento esistente, opt-in)', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('inviato'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1', 't2']);
  });

  it('skipInviati NON salta i rapportini in_corso: il nuovo ODL viene aggiunto con badge _nuovo', async () => {
    const { db, tables } = makeFakeDb(seedConRapportino('in_corso'));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', skipInviati: true });
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['t1', 't2']);
    const nuova = voci.find((v) => v.task_id === 't2') as { raw_json?: { _nuovo?: boolean } } | undefined;
    expect(nuova?.raw_json?._nuovo).toBe(true); // rapportino preesistente + task nuovo → badge
  });
});

describe('sincronizzaRapportini — ordine voci = ordine file (master), non la rotta', () => {
  it('voce.ordine segue l ordine-file (row-N), non la posizione nei task ottimizzata', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      // tasks in ordine-rotta (array) DIVERSO dall ordine-file (row-N)
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [
        { id: 'row-3', odl: 'C' }, { id: 'row-1', odl: 'A' }, { id: 'row-2', odl: 'B' },
      ] }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    const ord = Object.fromEntries(
      tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1').map((v) => [v.task_id, v.ordine]),
    );
    // ordine-file: row-1=1, row-2=2, row-3=3 (NON la posizione array che darebbe row-3=1)
    expect(ord['row-1']).toBe(1);
    expect(ord['row-2']).toBe(2);
    expect(ord['row-3']).toBe(3);
  });
});

describe('sincronizzaRapportini — risoluzione automatica del modello (senza templateId)', () => {
  const OP_BASE = { piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] };

  it('riusa il modello già stabilito dai rapportini esistenti del piano (riapertura)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl1', nome: 'VECCHIO', campi: [], info_campi: [], active: true },
        { id: 'tpl2', nome: 'DEFAULT', campi: [], info_campi: [], active: true, is_default: true },
      ],
      mappa_piani_operatori: [OP_BASE],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso', template_id: 'tpl1' }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    // NON passa al default: il piano resta sul suo modello (niente churn di link/snapshot).
    expect(tables.rapportini.find((r) => r.id === 'rap1')?.template_id).toBe('tpl1');
  });

  it('giro non classificabile → rapportino SENZA modello (mai il primo per nome)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl-manuale', nome: 'AAA MANUALE', campi: [], info_campi: [], active: true, is_default: true, solo_manuale: true },
        { id: 'tpl-a', nome: 'AAA', campi: [{ chiave: 'x', etichetta: 'X', tipo: 'testo', ordine: 1 }], info_campi: [], active: true, gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'] },
        { id: 'tpl-def', nome: 'ZZZ DEFAULT', campi: [], info_campi: [], active: true, is_default: true },
      ],
      mappa_piani_operatori: [OP_BASE], // task senza attività: non dice a quale flusso appartiene
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    // Il ripiego alfabetico avrebbe dato 'tpl-a' (AAA), cioè il modulo AcquaLatina a un giro
    // che non è suo: è l'incidente del 2026-08. Meglio nessun modulo.
    const rap = tables.rapportini.find((r) => r.staff_id === 's1');
    expect(rap?.template_id).toBeNull();
    expect(rap?.campi_snapshot).toEqual([]);
  });

  it('modello del rapportino = flusso PREVALENTE del giro (non l’ordine alfabetico)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      attivita_tassonomia: [
        { committente: 'acqualatina', descrizione: 'Sostituzione misuratore', descrizione_norm: 'SOSTITUZIONE MISURATORE', gruppo: 'SOSTITUZIONE MISURATORI', attivo: true },
        { committente: 'italgas', descrizione: 'S-PR-004 A', descrizione_norm: 'S-PR-004 A', gruppo: "ATTIVITA' ALLA CLIENTELA", attivo: true },
      ],
      rapportino_template: [
        { id: 'tpl-acqua', nome: 'AAA ACQUALATINA', campi: [{ chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', ordine: 1 }], info_campi: [], active: true, gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'] },
        { id: 'tpl-italgas', nome: 'ZZZ ITALGAS', campi: [{ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', ordine: 1 }], info_campi: [], active: true, gruppo_committente: 'italgas', gruppi_attivita: ["ATTIVITA' ALLA CLIENTELA"] },
      ],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [
          { id: 't1', odl: 'ODL1', attivita: 'S-PR-004 A' },
          { id: 't2', odl: 'ODL2', attivita: 'S-PR-004 A' },
          { id: 't3', odl: 'ODL3', attivita: 'Sostituzione misuratore' },
        ],
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.template_id).toBe('tpl-italgas');
  });

  it('voce senza intervento: il flusso arriva dal TASK (tassonomia dell’attività)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      attivita_tassonomia: [
        { committente: 'acea', descrizione: 'Regolarizzazione flusso idrico', descrizione_norm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'DUNNING', attivo: true },
        { committente: 'acqualatina', descrizione: 'Sostituzione misuratore', descrizione_norm: 'SOSTITUZIONE MISURATORE', gruppo: 'SOSTITUZIONE MISURATORI', attivo: true },
      ],
      rapportino_template: [
        { id: 'tpl-acqua', nome: 'AAA ACQUALATINA', campi: [{ chiave: 'matricola_nuova', etichetta: 'MATRICOLA NUOVO MISURATORE', tipo: 'matricola', ordine: 1, obbligatoria: true }], info_campi: [], active: true, gruppo_committente: 'acqualatina', gruppi_attivita: ['SOSTITUZIONE MISURATORI'] },
        { id: 'tpl-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', campi: [{ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', ordine: 1 }], info_campi: [], active: true, gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] },
      ],
      // Giro AcquaLatina (modello del rapportino) con dentro un task ACEA senza intervento:
      // è esattamente il rapportino di SIKORA del 07/08/2026.
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [
          { id: 't1', odl: 'ODL1', attivita: 'Sostituzione misuratore' },
          { id: 't2', odl: 'ODL2', attivita: 'Regolarizzazione flusso idrico' },
        ],
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    const voceAcea = tables.rapportino_voci.find((v) => v.task_id === 't2');
    expect(voceAcea?.template_id).toBe('tpl-dunning');
    expect((voceAcea?.campi_snapshot as Array<{ chiave: string }>).map((c) => c.chiave)).toEqual(['eseguito']);
  });

  it('task non classificabile → nessun flusso per la voce, e il motore lo segnala', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      attivita_tassonomia: [
        { committente: 'acea', descrizione: 'Regolarizzazione flusso idrico', descrizione_norm: 'REGOLARIZZAZIONE FLUSSO IDRICO', gruppo: 'DUNNING', attivo: true },
      ],
      rapportino_template: [
        { id: 'tpl-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', campi: [{ chiave: 'eseguito', etichetta: 'ESEGUITO', tipo: 'select', ordine: 1 }], info_campi: [], active: true, gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'] },
      ],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 't1', odl: 'ODL1', attivita: 'ATTIVITÀ FUORI CATALOGO' }],
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.taskSenzaFlusso).toEqual(['ATTIVITÀ FUORI CATALOGO']);
    expect(tables.rapportino_voci.find((v) => v.task_id === 't1')?.template_id).toBeNull();
  });

  it('piano con task RESINE → preferisce il template risanamento al primo per nome', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl-def', nome: 'DEFAULT', campi: [], info_campi: [], active: true, is_default: true },
        { id: 'tpl-ris', nome: 'RISANAMENTO', campi: [], info_campi: [], active: true, tipo: 'risanamento' },
      ],
      mappa_piani_operatori: [{ ...OP_BASE, tasks: [{ id: 't1', odl: 'ODL1', attivita: 'RESINE' }] }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.template_id).toBe('tpl-ris');
  });

  it('nessun template attivo utilizzabile → 422 con errore esplicito', async () => {
    const { db } = makeFakeDb(seedBase({
      rapportino_template: [{ id: 'tpl-manuale', nome: 'MANUALE', campi: [], info_campi: [], active: true, solo_manuale: true }],
      mappa_piani_operatori: [OP_BASE],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(422);
      expect(res.error).toMatch(/Azioni operatori/);
    }
  });

  it('il templateId esplicito vince sulla risoluzione automatica', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl1', nome: 'SCELTO', campi: [], info_campi: [] },
        { id: 'tpl-def', nome: 'DEFAULT', campi: [], info_campi: [], active: true, is_default: true },
      ],
      mappa_piani_operatori: [OP_BASE],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1' });
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.template_id).toBe('tpl1');
  });
});

describe('sincronizzaRapportini — voci per-attività (flusso dal gruppo)', () => {
  const CAMPI_DUNNING = [{ chiave: 'esito_dunning', etichetta: 'ESITO DUNNING', tipo: 'select', opzioni: ['SI', 'NO'], ordine: 1 }];
  const FLUSSO_DUNNING = {
    id: 'fl-dunning', nome: 'LIMITAZIONI/SOSPENSIONI', active: true, solo_manuale: false,
    campi: CAMPI_DUNNING, info_campi: [], gruppo_committente: 'acea', gruppi_attivita: ['DUNNING'],
  };

  it('la voce prende template_id + campi dal flusso del gruppo del SUO intervento; senza gruppo resta sul fallback', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [{ id: 'tpl1', campi: [], info_campi: [] }, FLUSSO_DUNNING],
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [
        { id: 't1', odl: 'ODL1' }, { id: 't2', odl: 'ODL2' },
      ] }],
      interventi: [
        { id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato', committente: 'acea', gruppo_attivita: 'DUNNING' },
        { id: 'i2', piano_id: 'p1', staff_id: 's1', odl: 'ODL2', stato: 'assegnato', committente: 'acea', gruppo_attivita: null },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const v1 = tables.rapportino_voci.find((v) => v.task_id === 't1');
    const v2 = tables.rapportino_voci.find((v) => v.task_id === 't2');
    expect(v1?.template_id).toBe('fl-dunning');
    expect(v1?.campi_snapshot).toEqual(CAMPI_DUNNING);
    expect(v2?.template_id ?? null).toBeNull();
    expect(v2?.campi_snapshot ?? null).toBeNull();
  });

  it("committente lim_massive equivale ad acea nel lookup; flusso inattivo o manuale non concorre", async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl1', campi: [], info_campi: [] },
        { ...FLUSSO_DUNNING, id: 'fl-spento', active: false },
        { ...FLUSSO_DUNNING, id: 'fl-manuale', solo_manuale: true },
        FLUSSO_DUNNING,
      ],
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [
        { id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato', committente: 'lim_massive', gruppo_attivita: 'DUNNING' },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    expect(tables.rapportino_voci.find((v) => v.task_id === 't1')?.template_id).toBe('fl-dunning');
  });
});

describe('sincronizzaRapportini — guardie commessa (G1/G2, piani con task acea:*)', () => {
  // Con l'unificazione i piani della commessa hanno operatori e task `acea:*` in
  // mappa_piani_operatori: un admin può legittimamente aprirli/salvarli/rigenerarli.
  // G1: un task già coperto da una voce superstite (origine != 'task') dello stesso
  // rapportino non deve rigenerare una voce doppia. G2: nessun rapportino NUOVO per chi ha
  // già tutto il lavoro commessa rendicontato nel rapportino (misto) di un altro piano.

  it('G1: il task acea:* già coperto dalla voce acea del rapportino non produce una voce doppia', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'acea:i1', odl: '912215286' }, { id: 'row-2', odl: 'ODL2' }],
      }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap1', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: { esito: 'eseguito' }, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    // La voce acea è UNA, con le risposte intatte; il task Excel genera la sua voce 'task'.
    expect(voci.filter((v) => v.task_id === 'acea:i1')).toHaveLength(1);
    expect(voci.find((v) => v.task_id === 'acea:i1')?.origine).toBe('acea');
    expect(voci.find((v) => v.task_id === 'acea:i1')?.risposte).toEqual({ esito: 'eseguito' });
    expect(voci.filter((v) => v.task_id === 'row-2')).toHaveLength(1);
  });

  it('G1 cintura per unità: task row-N con lo stesso ODL della voce acea → nessun doppione', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'row-9', odl: '912215286' }],
      }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap1', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: {}, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci).toHaveLength(1);
    expect(voci[0].task_id).toBe('acea:i1');
  });

  it('G1 acqualatina: stesso ODL ma matricola diversa → la voce si genera (cinque contatori, cinque voci)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'row-1', odl: 'X100', matricola: 'M1' }],
      }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap1', task_id: 'acea:i2', origine: 'acea', manuale: false,
        odl: 'X100', matricola: 'M2', risposte: {}, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    expect(voci.map((v) => v.task_id).sort()).toEqual(['acea:i2', 'row-1']);
  });

  it('G2: operatore misto con tutti i task acea:* già rendicontati su un altro piano → nessun rapportino nuovo, con warning', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      // Il rapportino "misto" vive su un piano di un ALTRO territorio (Italgas): niente
      // conflitto per rilevaConflitti, quindi senza G2 nascerebbe un secondo rapportino.
      mappa_piani: [
        { id: 'p1', data: '2026-06-10', territorio: 'TERR' },
        { id: 'p-italgas', data: '2026-06-10', territorio: 'ITALGAS' },
      ],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'acea:i1', odl: '912215286' }],
      }],
      rapportini: [{
        id: 'rap-misto', piano_id: 'p-italgas', staff_id: 's1', data: '2026-06-10',
        token: 'TOKM', stato: 'in_corso',
      }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap-misto', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: {}, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    // Nessun rapportino su p1: il lavoro è già tutto nel rapportino misto.
    expect(tables.rapportini.filter((r) => r.piano_id === 'p1')).toHaveLength(0);
    expect(tables.rapportini).toHaveLength(1);
    if (res.ok) expect(res.interventiWarning).toMatch(/già rendicontato/);
  });

  it('G1 cintura ODL: la voce MANUALE con lo stesso ODL di un task Excel NON filtra il task — la voce da-task compilata sopravvive', async () => {
    // Regressione FIRENZE/PERUGIA/LAZIO: prima della restrizione della cintura alle sole voci
    // 'acea', una voce dal «+» con lo stesso ODL faceva sparire la voce da-task COMPILATA
    // (delete senza ricreazione) — la stessa classe di incidente del 27/07-03/08.
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'row-5', odl: 'X100' }],
      }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [
        { id: 'vtask', rapportino_id: 'rap1', task_id: 'row-5', origine: 'task', manuale: false, odl: 'X100', risposte: { eseguito: 'SI', sigillo: 'X123' }, raw_json: {} },
        { id: 'vman', rapportino_id: 'rap1', task_id: null, origine: 'manuale', manuale: true, odl: 'X100', matricola: null, risposte: { esito: 'OK' }, raw_json: {} },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === 'rap1');
    const daTask = voci.filter((v) => v.task_id === 'row-5');
    expect(daTask).toHaveLength(1);                                     // ricreata, non persa
    expect(daTask[0].risposte).toEqual({ eseguito: 'SI', sigillo: 'X123' }); // risposte intatte
    expect(voci.find((v) => v.id === 'vman')).toBeTruthy();             // la manuale resta
  });

  it('G1 cintura ODL: la voce ACEA con lo stesso ODL di un task la cui voce da-task è COMPILATA non la cancella', async () => {
    // Il set `taskConRisposte` esenta il task dal filtro: meglio un doppione visibile che
    // lavoro registrato perso in silenzio.
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'row-5', odl: 'X100' }],
      }],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [
        { id: 'vtask', rapportino_id: 'rap1', task_id: 'row-5', origine: 'task', manuale: false, odl: 'X100', risposte: { eseguito: 'SI' }, raw_json: {} },
        { id: 'vacea', rapportino_id: 'rap1', task_id: 'acea:i9', origine: 'acea', manuale: false, odl: 'X100', risposte: { esito: 'eseguito' }, raw_json: {} },
      ],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const daTask = tables.rapportino_voci.filter((v) => v.task_id === 'row-5');
    expect(daTask).toHaveLength(1);
    expect(daTask[0].risposte).toEqual({ eseguito: 'SI' });
    expect(tables.rapportino_voci.find((v) => v.id === 'vacea')?.risposte).toEqual({ esito: 'eseguito' });
  });

  it('task acea:* sotto un ALTRO operatore dello STESSO piano: nessuna voce doppione (la voce resta al titolare)', async () => {
    // Task spostato in pianifica da s1 a s2: la voce acea (compilata) vive nel rapportino di
    // s1. G1 non scatta (rapportino diverso), taskAceaAltrove nemmeno (stesso piano): è la
    // cintura same-piano a impedire il doppione nel rapportino di s2.
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [
        { piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [] },
        { piano_id: 'p1', staff_id: 's2', staff_name: 'Luigi', tasks: [{ id: 'acea:i1', odl: '912215286' }, { id: 'row-7', odl: 'ODL7' }] },
      ],
      rapportini: [{ id: 'rap1', piano_id: 'p1', staff_id: 's1', data: '2026-06-10', token: 'TOK1', stato: 'in_corso' }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap1', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: { esito: 'eseguito' }, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const rap2 = tables.rapportini.find((r) => r.staff_id === 's2');
    expect(rap2).toBeTruthy();
    const vociS2 = tables.rapportino_voci.filter((v) => v.rapportino_id === rap2!.id);
    // Solo il task Excel: l'acea:* è già rendicontato nel rapportino di s1.
    expect(vociS2.map((v) => v.task_id)).toEqual(['row-7']);
    expect(tables.rapportino_voci.find((v) => v.id === 'vacea')?.risposte).toEqual({ esito: 'eseguito' });
  });

  it('G2 non scatta con un task Excel nel piano: il rapportino serve, ma il task acea:* rendicontato altrove non si duplica', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani: [
        { id: 'p1', data: '2026-06-10', territorio: 'TERR' },
        { id: 'p-italgas', data: '2026-06-10', territorio: 'ITALGAS' },
      ],
      mappa_piani_operatori: [{
        piano_id: 'p1', staff_id: 's1', staff_name: 'Mario',
        tasks: [{ id: 'acea:i1', odl: '912215286' }, { id: 'row-7', odl: 'ODL7' }],
      }],
      rapportini: [{
        id: 'rap-misto', piano_id: 'p-italgas', staff_id: 's1', data: '2026-06-10',
        token: 'TOKM', stato: 'in_corso',
      }],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap-misto', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: {}, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    const nuovo = tables.rapportini.find((r) => r.piano_id === 'p1');
    expect(nuovo).toBeTruthy();
    const voci = tables.rapportino_voci.filter((v) => v.rapportino_id === nuovo!.id);
    // Solo il task Excel: l'acea:* resta rendicontato una volta sola, sul rapportino misto.
    expect(voci.map((v) => v.task_id)).toEqual(['row-7']);
  });
});

describe('sincronizzaRapportini — blocco orfani con guardie (operatore non più nel piano)', () => {
  // Il blocco orfani gira PRIMA del loop per-operatore e cancella l'INTERO rapportino:
  // le guardie impediscono che un salvataggio del piano (payload senza l'operatore commessa,
  // tab stantio) distrugga lavoro che questo motore non possiede.

  it('un rapportino orfano con voci acea NON si elimina: resta con warning', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [
        { id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' },
        // PASTORELLI: rapportino della commessa sul piano, ma l'operatore non è (più) fra gli ops.
        { id: 'rap-acea', piano_id: 'p1', staff_id: 's9', staff_name: 'Pastorelli', token: 'TOK9', stato: 'inviato' },
      ],
      rapportino_voci: [{
        id: 'vacea', rapportino_id: 'rap-acea', task_id: 'acea:i1', origine: 'acea', manuale: false,
        odl: '912215286', risposte: { esito: 'eseguito' }, raw_json: {},
      }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    // Il rapportino sopravvive con le sue voci; l'anomalia è dichiarata, non taciuta.
    expect(tables.rapportini.find((r) => r.id === 'rap-acea')).toBeTruthy();
    expect(tables.rapportino_voci.find((v) => v.id === 'vacea')?.risposte).toEqual({ esito: 'eseguito' });
    if (res.ok) expect(res.interventiWarning).toMatch(/NON eliminato/);
  });

  it('con skipInviati un rapportino orfano INVIATO non si elimina (stessa promessa del loop voci)', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [
        { id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' },
        { id: 'rap-inv', piano_id: 'p1', staff_id: 's9', staff_name: 'Rossi', token: 'TOK9', stato: 'inviato' },
      ],
      rapportino_voci: [{ id: 'v9', rapportino_id: 'rap-inv', task_id: 'x1', origine: 'task', manuale: false, risposte: { eseguito: 'SI' }, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', { templateId: 'tpl1', skipInviati: true });
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.id === 'rap-inv')).toBeTruthy();
    if (res.ok) expect(res.interventiWarning).toMatch(/NON eliminato/);
  });

  it('un orfano senza protezioni (solo voci da-task, non inviato con skipInviati) si elimina come prima', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      rapportini: [
        { id: 'rap1', piano_id: 'p1', staff_id: 's1', token: 'TOK1', stato: 'in_corso' },
        { id: 'rap-orf', piano_id: 'p1', staff_id: 's9', staff_name: 'Verdi', token: 'TOK9', stato: 'in_corso' },
      ],
      rapportino_voci: [{ id: 'v9', rapportino_id: 'rap-orf', task_id: 'x1', origine: 'task', manuale: false, risposte: {}, raw_json: {} }],
    }));
    const res = await sincronizzaRapportini(db, 'p1', OPTS);
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.id === 'rap-orf')).toBeUndefined();
  });
});
