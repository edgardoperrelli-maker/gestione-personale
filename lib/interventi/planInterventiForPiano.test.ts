import { describe, it, expect } from 'vitest';
import { planInterventi, identitaIntervento, idAnnullatiDaEliminare } from './planInterventiForPiano';
import type { Task } from '@/utils/routing/types';
import { buildTassonomiaIndex, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const task = (over: Partial<Task>): Task => ({
  id: 't', odl: '', indirizzo: '', cap: '', citta: '', priorita: 0, fascia_oraria: '', ...over,
});

describe('planInterventi', () => {
  const piano = { data: '2026-06-03' };
  const base = { piano, pianoId: 'p1', territorioId: null as string | null };

  it('mappa i task in interventi assegnati', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1', citta: 'Roma' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(1);
    expect(r.daInserire[0]).toMatchObject({
      odl: 'A1', staff_id: 's1', data: '2026-06-03', stato: 'assegnato', piano_id: 'p1', comune: 'Roma',
    });
    expect(r.idDaEliminare).toEqual([]);
  });

  it('elimina i non-terminali e preserva (non duplica) i terminali', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' }), task({ odl: 'CHIUSO' })] }],
      esistenti: [
        { id: 'e1', odl: 'A1', stato: 'assegnato' },
        { id: 'e2', odl: 'CHIUSO', stato: 'completato' },
      ],
    });
    expect(r.idDaEliminare).toEqual(['e1']);
    const odls = r.daInserire.map((x) => x.odl);
    expect(odls).toContain('A1');
    expect(odls).not.toContain('CHIUSO');
  });

  it('dedup interno per odl', () => {
    const r = planInterventi({
      ...base,
      operatori: [
        { staff_id: 's1', tasks: [task({ odl: 'DUP' })] },
        { staff_id: 's2', tasks: [task({ odl: 'DUP' })] },
      ],
      esistenti: [],
    });
    expect(r.daInserire.filter((x) => x.odl === 'DUP')).toHaveLength(1);
  });

  it('scarta odl già presenti su altre righe della stessa data (chiave committente|odl)', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'X9' })] }],
      esistenti: [],
      odlGiaPresenti: new Set(['acea|X9']),
    });
    expect(r.daInserire).toHaveLength(0);
  });

  it('lo stesso odl sotto un ALTRO committente non blocca (indice unico per committente)', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'X9' })] }],
      esistenti: [],
      odlGiaPresenti: new Set(['italgas|X9']),
    });
    expect(r.daInserire).toHaveLength(1);
  });

  it('le righe senza odl non vengono deduplicate', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '' }), task({ odl: '' })] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(2);
  });

  it('non duplica un intervento terminale SENZA odl (identità matricola+indirizzo)', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M1', indirizzo: 'Via Roma 1' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
      ],
    });
    // il task corrisponde a un intervento GIÀ completato → niente duplicato, terminale preservato
    expect(r.daInserire).toHaveLength(0);
    expect(r.idDaEliminare).toEqual([]);
  });

  it('non accorpa interventi senza odl con matricola diversa', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M2', indirizzo: 'Via Roma 1' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
      ],
    });
    // matricola diversa → job distinto → va inserito (no over-dedup)
    expect(r.daInserire).toHaveLength(1);
  });

  it('terminale senza odl con tipo variante grezza NON viene duplicato dopo la canonicalizzazione', () => {
    // Riga terminale scritta in un giro SENZA tassonomia (variante grezza: doppi spazi, case
    // libero); il task fresco risolve alla canonica via indice. La chiave identitaIntervento
    // deve normalizzare il tipo (chiaveTassonomia) → stesso lavoro, niente duplicato.
    const indice = buildTassonomiaIndex([
      {
        committente: 'acea',
        descrizione: 'S-PR-003 A SONDA',
        descrizioneNorm: 'S-PR-003 A SONDA',
        gruppo: 'PRELIEVI',
        attivo: true,
      },
    ] as TassonomiaRiga[]);
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M1', indirizzo: 'Via Roma 1', attivita: 's-pr-003 a sonda' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1', intervento_tipo: 'S-PR-003  A  Sonda' },
      ],
      indiceTassonomia: indice,
    });
    expect(r.daInserire).toHaveLength(0);
    expect(r.idDaEliminare).toEqual([]);
  });

  it('terminale massive con variante "LIMITAZIONE MASSIVA" NON duplicato dopo auto-allineamento', () => {
    // Scenario review: la riga completata è stata scritta con la vecchia forma "LIMITAZIONE MASSIVA"
    // (null ODL); il task fresco risolve, con l'alias di scrittura, a "LIMITAZIONI MASSIVE".
    // identitaIntervento allinea ENTRAMBI i lati → stessa chiave → nessun duplicato/risurrezione.
    const indice = buildTassonomiaIndex([
      { committente: 'acea', descrizione: 'LIMITAZIONI MASSIVE', descrizioneNorm: 'LIMITAZIONI MASSIVE', gruppo: 'LIMITAZIONI MASSIVE', attivo: true },
    ] as TassonomiaRiga[]);
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M1', indirizzo: 'Via Roma 1', attivita: 'LIMITAZIONE MASSIVA' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1', intervento_tipo: 'LIMITAZIONE MASSIVA' },
      ],
      indiceTassonomia: indice,
    });
    expect(r.daInserire).toHaveLength(0);
    expect(r.idDaEliminare).toEqual([]);
  });

  it('terminale ATLAS null-ODL: forma lunga stored vs bare fresco NON duplicato', () => {
    // Un DIS00N italgas può essere memorizzato sia bare ('DIS00N', da mappa) sia lungo
    // ('DIS00N - DISATTIVAZIONE…', da import forma lunga o editor voce): stesso lavoro null-ODL.
    // identitaIntervento collassa entrambe le forme (tier completo) → una sola identità.
    const AC = "ATTIVITA' ALLA CLIENTELA";
    const indice = buildTassonomiaIndex([
      { committente: 'italgas', descrizione: 'DIS00N', descrizioneNorm: 'DIS00N', gruppo: AC, attivo: true },
      { committente: 'italgas', descrizione: 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', descrizioneNorm: 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO', gruppo: AC, attivo: true },
    ] as TassonomiaRiga[]);
    const r = planInterventi({
      ...base,
      committente: 'italgas',
      operatori: [{ staff_id: 's1', tasks: [task({ odl: '', matricola: 'M1', indirizzo: 'Via Roma 1', attivita: 'DIS00N' })] }],
      esistenti: [
        { id: 'e1', odl: null, stato: 'completato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1', intervento_tipo: 'DIS00N - DISATTIVAZIONE SUCCESSIVO PASSAGGIO' },
      ],
      indiceTassonomia: indice,
    });
    expect(r.daInserire).toHaveLength(0);
  });

  it('scarta gli ODL già eseguiti positivi altrove e li riporta in odlBloccati', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'GIAPOS' }), task({ odl: 'B2' })] }],
      esistenti: [],
      odlGiaPositivi: new Set(['giapos']),
    });
    expect(r.daInserire.map((x) => x.odl)).toEqual(['B2']);
    expect(r.odlBloccati).toEqual(['GIAPOS']);
  });

  it('il terminale del PIANO STESSO resta preservato anche se il suo odl è tra i positivi', () => {
    // caso rigenerazione: il positivo è di questo piano → keyTerminali lo preserva,
    // il task non viene reinserito e non finisce tra i bloccati.
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'CHIUSO' })] }],
      esistenti: [{ id: 'e2', odl: 'CHIUSO', stato: 'completato' }],
      odlGiaPositivi: new Set(['chiuso']),
    });
    expect(r.daInserire).toHaveLength(0);
    expect(r.idDaEliminare).toEqual([]);
    expect(r.odlBloccati).toEqual([]);
  });

  it('un intervento annullato esistente VIENE preservato (esito reale, mai cancellato da rigenera)', () => {
    const out = planInterventi({
      piano: { data: '2026-06-10' }, pianoId: 'p1', territorioId: null,
      operatori: [{ staff_id: 's1', tasks: [{ id: 't1', odl: 'ODL1', indirizzo: 'V', cap: '0', citta: 'R', priorita: 0, fascia_oraria: '' }] }],
      esistenti: [{ id: 'i1', odl: 'ODL1', stato: 'annullato' }],
    });
    expect(out.idDaEliminare).not.toContain('i1');
  });
});

describe('idAnnullatiDaEliminare', () => {
  it('seleziona solo gli annullati con identità tra le chiavi eliminate', () => {
    const esistenti = [
      { id: 'a', odl: 'ODL1', stato: 'annullato' },
      { id: 'b', odl: 'ODL2', stato: 'annullato' },
      { id: 'c', odl: 'ODL3', stato: 'assegnato' },
    ];
    const keys = new Set([identitaIntervento({ odl: 'ODL1' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual(['a']);
  });

  it('non tocca gli assegnati anche se la loro identità è nelle chiavi', () => {
    const esistenti = [{ id: 'c', odl: 'ODL3', stato: 'assegnato' }];
    const keys = new Set([identitaIntervento({ odl: 'ODL3' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual([]);
  });

  it('identità composta senza odl (indirizzo+matricola)', () => {
    const esistenti = [
      { id: 'm', odl: null, stato: 'annullato', matricola_contatore: 'M1', indirizzo: 'Via Roma 1' },
    ];
    const keys = new Set([identitaIntervento({ odl: null, matricola_contatore: 'M1', indirizzo: 'Via Roma 1' })!]);
    expect(idAnnullatiDaEliminare(esistenti, keys)).toEqual(['m']);
  });

  it('set vuoto → nessuna cancellazione', () => {
    const esistenti = [{ id: 'a', odl: 'ODL1', stato: 'annullato' }];
    expect(idAnnullatiDaEliminare(esistenti, new Set<string>())).toEqual([]);
  });
});

/**
 * Regressione del 03/08/2026: salvare un piano ACQUA LATINA rispondeva 500 con
 * «duplicate key value violates unique constraint "interventi_dedup_acqualatina_idx"».
 * Il chiamante leggeva gli interventi del piano filtrando `created_from_mappa = true`:
 * le righe manuali/import restavano invisibili alla pianificazione ma non al database,
 * che rifiutava l'insert e faceva fallire il salvataggio dell'intero piano.
 */
describe('planInterventi · righe che la mappa non ha creato', () => {
  const piano = { data: '2026-08-03' };
  const base = { piano, pianoId: 'p1', territorioId: null as string | null };

  it('non reinserisce un task già coperto da una riga non-mappa dello stesso piano', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' })] }],
      esistenti: [{ id: 'man1', odl: 'A1', stato: 'completato', created_from_mappa: false }],
    });
    expect(r.daInserire).toHaveLength(0);
  });

  it('non cancella MAI una riga non-mappa, nemmeno se non è terminale', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' })] }],
      esistenti: [{ id: 'man1', odl: 'A1', stato: 'assegnato', created_from_mappa: false }],
    });
    expect(r.idDaEliminare).toEqual([]);
    // La sua chiave è occupata: reinserirla violerebbe l'indice unico.
    expect(r.daInserire).toHaveLength(0);
  });

  it('continua a rigenerare le righe create dalla mappa', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' })] }],
      esistenti: [{ id: 'map1', odl: 'A1', stato: 'assegnato', created_from_mappa: true }],
    });
    expect(r.idDaEliminare).toEqual(['map1']);
    expect(r.daInserire.map((x) => x.odl)).toEqual(['A1']);
  });

  it('senza created_from_mappa si comporta come prima (riga della mappa)', () => {
    const r = planInterventi({
      ...base,
      operatori: [{ staff_id: 's1', tasks: [task({ odl: 'A1' })] }],
      esistenti: [{ id: 'e1', odl: 'A1', stato: 'assegnato' }],
    });
    expect(r.idDaEliminare).toEqual(['e1']);
  });
});

/**
 * Su ACQUA LATINA l'indice unico include la matricola: lo stesso ODL può coprire più
 * misuratori. Deduplicare per solo ODL scartava come doppione del lavoro legittimo.
 */
describe('planInterventi · unicità per committente', () => {
  const piano = { data: '2026-08-03' };
  const acqua = { piano, pianoId: 'p1', territorioId: null as string | null, committente: 'acqualatina' };

  it('acqualatina: stesso odl con matricola diversa è lavoro distinto', () => {
    const r = planInterventi({
      ...acqua,
      operatori: [{ staff_id: 's1', tasks: [
        task({ odl: 'A1', matricola: 'M1' }),
        task({ odl: 'A1', matricola: 'M2' }),
      ] }],
      esistenti: [],
    });
    expect(r.daInserire.map((x) => x.matricola_contatore)).toEqual(['M1', 'M2']);
  });

  it('acqualatina: stesso odl E stessa matricola resta un doppione', () => {
    const r = planInterventi({
      ...acqua,
      operatori: [{ staff_id: 's1', tasks: [
        task({ odl: 'A1', matricola: 'M1' }),
        task({ odl: 'A1', matricola: 'M1' }),
      ] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(1);
  });

  it('acqualatina: la matricola già presente nel piano blocca solo la sua', () => {
    const r = planInterventi({
      ...acqua,
      operatori: [{ staff_id: 's1', tasks: [
        task({ odl: 'A1', matricola: 'M1' }),
        task({ odl: 'A1', matricola: 'M2' }),
      ] }],
      esistenti: [{ id: 'x', odl: 'A1', stato: 'completato', matricola_contatore: 'M1', committente: 'acqualatina' }],
    });
    expect(r.daInserire.map((x) => x.matricola_contatore)).toEqual(['M2']);
  });

  it('altri committenti: la matricola non conta, l\'odl basta', () => {
    const r = planInterventi({
      piano, pianoId: 'p1', territorioId: null,
      operatori: [{ staff_id: 's1', tasks: [
        task({ odl: 'A1', matricola: 'M1' }),
        task({ odl: 'A1', matricola: 'M2' }),
      ] }],
      esistenti: [],
    });
    expect(r.daInserire).toHaveLength(1);
  });
});
