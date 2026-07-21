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
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', risposte: { q: 'A' }, raw_json: {} }],
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
      rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: { eseguito: 'SI' }, raw_json: {} }],
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
        { id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} },
        { id: 'vman', rapportino_id: 'rap1', task_id: null, manuale: true, approvazione_stato: 'in_attesa', richiesta_id: 'req1', risposte: { esito: 'OK' }, raw_json: { _nuovo: true } },
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

describe('sincronizzaRapportini — fallback FK su race', () => {
  it("se l'insert voci va in FK violation, salva le voci SENZA collegamento e non fallisce", async () => {
    const { db, tables } = makeFakeDb(seedBase({
      mappa_piani_operatori: [{ piano_id: 'p1', staff_id: 's1', staff_name: 'Mario', tasks: [{ id: 't1', odl: 'ODL1' }] }],
      interventi: [{ id: 'i1', piano_id: 'p1', staff_id: 's1', odl: 'ODL1', stato: 'assegnato' }],
    }), { failVociInsertOnce: 'violates foreign key constraint "rapportino_voci_intervento_id_fkey"' });
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
    rapportino_voci: [{ id: 'v1', rapportino_id: 'rap1', task_id: 't1', manuale: false, risposte: {}, raw_json: {} }],
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

  it('piano nuovo senza rapportini → sceglie il default attivo, ignorando i solo_manuale', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl-manuale', nome: 'AAA MANUALE', campi: [], info_campi: [], active: true, is_default: true, solo_manuale: true },
        { id: 'tpl-a', nome: 'AAA', campi: [], info_campi: [], active: true },
        { id: 'tpl-def', nome: 'ZZZ DEFAULT', campi: [], info_campi: [], active: true, is_default: true },
      ],
      mappa_piani_operatori: [OP_BASE],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.template_id).toBe('tpl-def');
  });

  it('senza default → primo template attivo non-manuale in ordine nome', async () => {
    const { db, tables } = makeFakeDb(seedBase({
      rapportino_template: [
        { id: 'tpl-b', nome: 'BBB', campi: [], info_campi: [], active: true },
        { id: 'tpl-a', nome: 'AAA', campi: [], info_campi: [], active: true },
      ],
      mappa_piani_operatori: [OP_BASE],
    }));
    const res = await sincronizzaRapportini(db, 'p1', {});
    expect(res.ok).toBe(true);
    expect(tables.rapportini.find((r) => r.staff_id === 's1')?.template_id).toBe('tpl-a');
  });

  it('piano con task RESINE → preferisce il template risanamento al default', async () => {
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
