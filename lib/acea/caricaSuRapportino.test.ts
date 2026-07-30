import { describe, it, expect } from 'vitest';
import {
  anteprimeRapportini, gruppiPerRapportino, MAX_COPPIE_ANTEPRIMA, parseCoppie,
  type RigaSelezionataPerRapportino,
} from './caricaSuRapportino';

const ATTIVI = [
  { id: 's1', display_name: 'DANIELE BELLOMO' },
  { id: 's2', display_name: 'SPAGNOLI LUCA' },
];

const riga = (over: Partial<RigaSelezionataPerRapportino> = {}): RigaSelezionataPerRapportino => ({
  pianificato_a: 'DANIELE BELLOMO', pianificato_il: '2026-07-30', ...over,
});

describe('gruppiPerRapportino', () => {
  it('raggruppa per (esecutore, giorno) e conta le righe', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga(), riga(), riga({ pianificato_a: 'SPAGNOLI LUCA' })],
      ATTIVI,
    );
    expect(nonPronte).toBe(0);
    expect(gruppi).toEqual([
      { staffId: 's1', nome: 'DANIELE BELLOMO', data: '2026-07-30', righe: 2 },
      { staffId: 's2', nome: 'SPAGNOLI LUCA', data: '2026-07-30', righe: 1 },
    ]);
  });

  it('lo stesso esecutore su due giorni fa due gruppi: due rapportini diversi', () => {
    const { gruppi } = gruppiPerRapportino(
      [riga(), riga({ pianificato_il: '2026-07-31' })],
      ATTIVI,
    );
    expect(gruppi.map((g) => g.data)).toEqual(['2026-07-30', '2026-07-31']);
  });

  it('senza esecutore o senza data la riga non è pronta: si conta, non si inventa', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificato_a: null }), riga({ pianificato_il: null }), riga()],
      ATTIVI,
    );
    expect(nonPronte).toBe(2);
    expect(gruppi).toHaveLength(1);
  });

  it('un APPUNTO non si carica: non c’è nessun intervento dietro', () => {
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificazione_parziale: true })],
      ATTIVI,
    );
    expect(nonPronte).toBe(1);
    expect(gruppi).toEqual([]);
  });

  it('il nome si risolve senza badare a maiuscole e spazi doppi', () => {
    const { gruppi } = gruppiPerRapportino(
      [riga({ pianificato_a: '  daniele   bellomo ' })],
      ATTIVI,
    );
    expect(gruppi[0]?.staffId).toBe('s1');
  });

  it('un nome che non risolve sugli attivi non è pronto', () => {
    // Capita quando la tabella mostra l'uuid di ripiego o l'elenco attivi non è caricato.
    const { gruppi, nonPronte } = gruppiPerRapportino(
      [riga({ pianificato_a: 'uuid-non-nome' })],
      ATTIVI,
    );
    expect(nonPronte).toBe(1);
    expect(gruppi).toEqual([]);
  });

  it('selezione vuota: niente gruppi, niente non-pronte', () => {
    expect(gruppiPerRapportino([], ATTIVI)).toEqual({ gruppi: [], nonPronte: 0 });
  });
});

/*
  L'anteprima della modale: «si integra» o «ne nasce uno», detto PRIMA di premere. Il matching è
  esatto sulla coppia (staff, giorno) perché la lettura a monte porta il prodotto incrociato di
  date e operatori — e un rapportino di Bellomo di IERI non deve dire «esiste» per oggi.
*/
describe('parseCoppie', () => {
  it('legge, dedup e scarta le malformate in silenzio', () => {
    expect(parseCoppie(['s1|2026-07-30', 's1|2026-07-30', ' s2 |2026-07-31'])).toEqual([
      { staffId: 's1', data: '2026-07-30' },
      { staffId: 's2', data: '2026-07-31' },
    ]);
    expect(parseCoppie(['|2026-07-30', 's1|30/07/2026', 's1|', 'niente', ''])).toEqual([]);
  });

  it('ha un tetto: è un\'anteprima per selezioni, non una scansione', () => {
    const tante = Array.from({ length: 300 }, (_, i) => `s${i}|2026-07-30`);
    expect(parseCoppie(tante)).toHaveLength(MAX_COPPIE_ANTEPRIMA);
  });
});

describe('anteprimeRapportini', () => {
  const RAP = [
    { id: 'r1', staff_id: 's1', data: '2026-07-30', stato: 'in_corso' },
    { id: 'r2', staff_id: 's2', data: '2026-07-31', stato: 'inviato' },
  ];
  const VOCI = new Map([['r1', 4], ['r2', 7]]);

  it('esistente: stato e voci a bordo; assente: rapportino nuovo', () => {
    const a = anteprimeRapportini(
      [
        { staffId: 's1', data: '2026-07-30' },
        { staffId: 's3', data: '2026-07-30' },
      ],
      RAP, VOCI,
    );
    expect(a).toEqual([
      { staffId: 's1', data: '2026-07-30', esiste: true, stato: 'in_corso', voci: 4 },
      { staffId: 's3', data: '2026-07-30', esiste: false, stato: null, voci: 0 },
    ]);
  });

  it('il consegnato si vede dallo stato: la modale avvisa che verrà chiesto di riaprirlo', () => {
    const [a] = anteprimeRapportini([{ staffId: 's2', data: '2026-07-31' }], RAP, VOCI);
    expect(a).toMatchObject({ esiste: true, stato: 'inviato', voci: 7 });
  });

  it('NIENTE prodotto incrociato: il rapportino di s1 di un ALTRO giorno non «esiste» per oggi', () => {
    // La lettura a monte usa `in` su date e staff separati: s1|31 arriva fra gli esistenti solo
    // se c'è davvero, non perché s1 ha un rapportino il 30 e qualcun altro ne ha uno il 31.
    const [a] = anteprimeRapportini([{ staffId: 's1', data: '2026-07-31' }], RAP, VOCI);
    expect(a).toMatchObject({ esiste: false, stato: null, voci: 0 });
  });

  it('un rapportino esistente senza voci conta 0, non «assente»', () => {
    const [a] = anteprimeRapportini(
      [{ staffId: 's1', data: '2026-07-30' }],
      RAP,
      new Map(),
    );
    expect(a).toMatchObject({ esiste: true, voci: 0 });
  });
});
