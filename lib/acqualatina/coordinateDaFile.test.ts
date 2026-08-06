import { describe, it, expect } from 'vitest';
import {
  LIMITE_RIGHE_FOGLIO, abbinaCoordinate, coordinatePerVoce, parseCoordinateFile, righeDaPayload,
  trovaHeaderCoordinate, vociDaAggiornare, type OrdineConMatricola, type OrdineDaCoordinare,
} from './coordinateDaFile';

/** L'header vero dell'estrazione di Terracina, ridotto alle colonne che contano. */
const HEADER_TERRACINA = [
  'COD_FORNITURA', 'COD_CLIENTE', 'RAGSOC', 'SER_CODLIBRO', 'MATRICOLA',
  'VIAINDIRIZZOFORN', 'CIVINDIRIZZOFORN', 'COMUNEINDIRIZZOFORN',
  'LATITUDINE', 'LONGITUDINE', 'CODODL',
];
const riga = (over: Partial<Record<string, string>> = {}): string[] => ([
  over.fornitura ?? '77942025', '1049332', 'LUKEBRAS VAPE', over.libro ?? '9291', '64313',
  'VIA BADINO', '257/2', 'TERRACINA',
  over.lat ?? '41.28837585', over.lng ?? '13.22436428', over.odl ?? '',
]);

describe('parseCoordinateFile', () => {
  it('legge fornitura, ODL e coordinate dall’estrazione del committente', () => {
    const res = parseCoordinateFile([HEADER_TERRACINA, riga({ odl: '912350788' })]);
    expect(res.totale).toBe(1);
    expect(res.righe).toEqual([
      { odl: '912350788', impianto: '77942025', coordinate: '41.2883759, 13.2243643' },
    ]);
  });

  /*
    La riga senza CODODL è la NORMA, non l'eccezione: nel file di Terracina 3.705 righe su 4.194
    non hanno un ordine. Si agganciano per fornitura, ed è tutto il motivo per cui questo percorso
    non passa dal master (che senza ODL le scarterebbe).
  */
  it('tiene le righe senza ODL: si agganciano per fornitura', () => {
    const res = parseCoordinateFile([HEADER_TERRACINA, riga()]);
    expect(res.righe).toHaveLength(1);
    expect(res.righe[0]).toMatchObject({ odl: '', impianto: '77942025' });
  });

  /*
    Regressione: «SER_CODLIBRO» normalizza in «sercodlibro», che CONTIENE «odl» e sta PRIMA di
    CODODL nell'header. Con un pattern non ancorato il numero del libretto passerebbe per un
    ordine, e le coordinate finirebbero su righe di registro che non c'entrano niente.
  */
  it('non scambia SER_CODLIBRO per la colonna CODODL', () => {
    const res = parseCoordinateFile([HEADER_TERRACINA, riga({ libro: '9291', odl: '912350788' })]);
    expect(res.righe[0].odl).toBe('912350788');
  });

  it('conta le righe senza coordinate valide invece di inventarle', () => {
    const res = parseCoordinateFile([
      HEADER_TERRACINA,
      riga({ lat: '', lng: '' }),
      riga({ lat: '0', lng: '0' }),
      riga({ lat: 'N/A', lng: 'N/A' }),
      riga(),
    ]);
    expect(res.senzaCoordinate).toBe(3);
    expect(res.righe).toHaveLength(1);
  });

  it('accetta la virgola decimale all’italiana', () => {
    const res = parseCoordinateFile([HEADER_TERRACINA, riga({ lat: '41,288', lng: '13,224' })]);
    expect(res.righe[0].coordinate).toBe('41.288, 13.224');
  });

  it('riconosce anche le intestazioni corte Lat/Long', () => {
    const rows = [
      ['Ordine', 'Impianto', 'Lat', 'Long'],
      ['912350788', '4004130614', '41.81', '12.84'],
    ];
    expect(parseCoordinateFile(rows).righe).toEqual([
      { odl: '912350788', impianto: '4004130614', coordinate: '41.81, 12.84' },
    ]);
  });

  it('header non in prima riga (preamboli del committente)', () => {
    const rows = [
      ['Estrazione forniture', '', '', ''],
      [],
      ['COD_FORNITURA', 'LATITUDINE', 'LONGITUDINE', 'CODODL'],
      ['77942025', '41.288', '13.224', ''],
    ];
    expect(trovaHeaderCoordinate(rows)).toBe(2);
    expect(parseCoordinateFile(rows).righe).toHaveLength(1);
  });

  it('rifiuta rumorosamente un file che non è l’estrazione con le coordinate', () => {
    expect(() => parseCoordinateFile([['ODL', 'Matricola'], ['9123', 'MAT1']]))
      .toThrowError(/LATITUDINE/i);
  });
});

describe('righeDaPayload — quello che manda il browser non è fidato', () => {
  it('tiene le righe buone e ricalcola la coordinata', () => {
    expect(righeDaPayload([{ odl: ' 912350788 ', impianto: '77942025', coordinate: '41.288, 13.224' }]))
      .toEqual([{ odl: '912350788', impianto: '77942025', coordinate: '41.288, 13.224' }]);
  });

  /* La coppia scritta all'italiana è ambigua (quattro pezzi, non due): si scarta, non si indovina. */
  it('scarta la coppia con virgole decimali invece di inventare un punto', () => {
    expect(righeDaPayload([{ odl: '1', impianto: 'A', coordinate: '41,288, 13,224' }])).toEqual([]);
  });

  it('scarta le coordinate non valide invece di scriverle a registro', () => {
    expect(righeDaPayload([
      { odl: '1', impianto: 'A', coordinate: '0, 0' },
      { odl: '2', impianto: 'B', coordinate: '999, 999' },
      { odl: '3', impianto: 'C', coordinate: 'ciao' },
      { odl: '4', impianto: 'D', coordinate: '' },
      { odl: '5', impianto: 'E' },
    ])).toEqual([]);
  });

  it('scarta una riga senza né ODL né fornitura: non avrebbe come agganciarsi', () => {
    expect(righeDaPayload([{ odl: '', impianto: '', coordinate: '41.288, 13.224' }])).toEqual([]);
  });

  it('regge input malformato senza lanciare', () => {
    expect(righeDaPayload(null)).toEqual([]);
    expect(righeDaPayload('non un array')).toEqual([]);
    expect(righeDaPayload([null, 42, 'x', { odl: '1', coordinate: '41.288, 13.224' }]))
      .toEqual([{ odl: '1', impianto: '', coordinate: '41.288, 13.224' }]);
  });

  /* Una riga rotta in mezzo a quattromila non deve far fallire l'import: si scarta e si conta. */
  it('una riga rotta non travolge le buone', () => {
    const righe = righeDaPayload([
      { odl: '1', impianto: 'A', coordinate: '41.1, 13.1' },
      { odl: '2', impianto: 'B', coordinate: 'rotta' },
      { odl: '3', impianto: 'C', coordinate: '41.3, 13.3' },
    ]);
    expect(righe.map((r) => r.odl)).toEqual(['1', '3']);
  });
});

describe('il tetto delle righe non tronca in silenzio', () => {
  it('se i dati arrivano al tetto, si ferma e lo dice', () => {
    const header = ['COD_FORNITURA', 'LATITUDINE', 'LONGITUDINE'];
    const rows: unknown[][] = [header];
    for (let i = 0; i < LIMITE_RIGHE_FOGLIO; i++) rows.push([`F${i}`, '41.288', '13.224']);
    expect(() => parseCoordinateFile(rows)).toThrowError(/dividilo per comune/i);
  });
});

describe('abbinaCoordinate', () => {
  const ordine = (over: Partial<OrdineDaCoordinare> = {}): OrdineDaCoordinare => ({
    odl: '912350788', numero_operazione: '1', impianto: '77942025', coordinate: null, ...over,
  });

  it('la fornitura è l’aggancio preciso: scrive sulla riga di quel punto', () => {
    const res = abbinaCoordinate(
      [{ odl: '', impianto: '77942025', coordinate: '41.288, 13.224' }],
      [ordine(), ordine({ impianto: '99999999', numero_operazione: '2' })],
    );
    expect(res.aggiornamenti).toEqual([
      { odl: '912350788', numero_operazione: '1', coordinate: '41.288, 13.224' },
    ]);
  });

  /* Il condominio: un ODL, cinque contatori, un portone solo. */
  it('senza fornitura ripiega sull’ODL e copre tutte le sue operazioni', () => {
    const res = abbinaCoordinate(
      [{ odl: '912350788', impianto: '', coordinate: '41.288, 13.224' }],
      [ordine({ numero_operazione: '1' }), ordine({ numero_operazione: '2' }), ordine({ numero_operazione: '3' })],
    );
    expect(res.aggiornamenti.map((a) => a.numero_operazione)).toEqual(['1', '2', '3']);
  });

  it('la fornitura VINCE sull’ODL quando il file porta entrambi', () => {
    const res = abbinaCoordinate(
      [{ odl: '912350788', impianto: '77942025', coordinate: '41.288, 13.224' }],
      [
        ordine({ numero_operazione: '1', impianto: '77942025' }),
        ordine({ numero_operazione: '2', impianto: '88888888' }),
      ],
    );
    expect(res.aggiornamenti).toHaveLength(1);
    expect(res.aggiornamenti[0].numero_operazione).toBe('1');
  });

  it('idempotente: una coordinata già identica non si riscrive', () => {
    const res = abbinaCoordinate(
      [{ odl: '', impianto: '77942025', coordinate: '41.288, 13.224' }],
      [ordine({ coordinate: '41.288, 13.224' })],
    );
    expect(res.aggiornamenti).toEqual([]);
    expect(res.giaUguali).toBe(1);
  });

  it('una coordinata diversa CORREGGE quella a registro', () => {
    const res = abbinaCoordinate(
      [{ odl: '', impianto: '77942025', coordinate: '41.999, 13.999' }],
      [ordine({ coordinate: '41.288, 13.224' })],
    );
    expect(res.aggiornamenti[0].coordinate).toBe('41.999, 13.999');
  });

  it('una fornitura che il registro non conosce si conta, non entra', () => {
    const res = abbinaCoordinate(
      [{ odl: '', impianto: '00000000', coordinate: '41.288, 13.224' }],
      [ordine()],
    );
    expect(res.aggiornamenti).toEqual([]);
    expect(res.nonTrovate).toBe(1);
  });

  it('due righe del file sullo stesso punto: vince la prima, niente scritture doppie', () => {
    const res = abbinaCoordinate(
      [
        { odl: '', impianto: '77942025', coordinate: '41.111, 13.111' },
        { odl: '912350788', impianto: '', coordinate: '41.222, 13.222' },
      ],
      [ordine()],
    );
    expect(res.aggiornamenti).toEqual([
      { odl: '912350788', numero_operazione: '1', coordinate: '41.111, 13.111' },
    ]);
  });
});

describe('coordinatePerVoce', () => {
  const riga = (over: Partial<OrdineConMatricola> = {}): OrdineConMatricola => ({
    odl: '912350788', numero_operazione: '1', impianto: '77942025',
    matricola_norm: 'MAT1', coordinate: null, ...over,
  });

  it('indicizza per odl#matricola e per odl', () => {
    const m = coordinatePerVoce([riga({ coordinate: '41.1, 13.1' })], []);
    expect(m.get('912350788#MAT1')).toBe('41.1, 13.1');
    expect(m.get('912350788')).toBe('41.1, 13.1');
  });

  /* Le scritture appena fatte valgono più del valore letto prima: la mappa descrive il registro
     com'è ADESSO, senza rileggerlo. */
  it('gli aggiornamenti appena scritti vincono sul valore vecchio', () => {
    const m = coordinatePerVoce(
      [riga({ coordinate: '40.0, 14.0' })],
      [{ odl: '912350788', numero_operazione: '1', coordinate: '41.9, 13.9' }],
    );
    expect(m.get('912350788#MAT1')).toBe('41.9, 13.9');
  });

  it('sul ripiego per solo ODL vince la prima operazione (è comunque il portone)', () => {
    const m = coordinatePerVoce([
      riga({ numero_operazione: '1', matricola_norm: 'A', coordinate: '41.1, 13.1' }),
      riga({ numero_operazione: '2', matricola_norm: 'B', coordinate: '41.2, 13.2' }),
    ], []);
    expect(m.get('912350788')).toBe('41.1, 13.1');
    expect(m.get('912350788#B')).toBe('41.2, 13.2');
  });

  it('le righe senza coordinata non entrano', () => {
    expect(coordinatePerVoce([riga({ coordinate: null }), riga({ coordinate: '  ' })], []).size).toBe(0);
  });
});

describe('vociDaAggiornare', () => {
  const mappa = new Map([
    ['912350788#MAT1', '41.1, 13.1'],
    ['912350788', '41.0, 13.0'],
  ]);
  const voce = (over: Partial<Parameters<typeof vociDaAggiornare>[0][number]> = {}) => ({
    id: 'v1', odl: '912350788', matricola: 'MAT1', raw_json: {}, ...over,
  });

  it('la matricola è più precisa dell’ODL e vince', () => {
    expect(vociDaAggiornare([voce()], mappa)).toEqual([
      { id: 'v1', raw_json: { coordinate: '41.1, 13.1' } },
    ]);
  });

  it('senza matricola ripiega sull’ODL', () => {
    expect(vociDaAggiornare([voce({ matricola: null })], mappa)[0].raw_json.coordinate)
      .toBe('41.0, 13.0');
  });

  it('confronta la matricola normalizzata (trattini e minuscole non contano)', () => {
    expect(vociDaAggiornare([voce({ matricola: 'mat-1' })], mappa)[0].raw_json.coordinate)
      .toBe('41.1, 13.1');
  });

  /* Il raw_json porta la nota dell'ufficio, il badge «nuovo», la provenienza: sostituirlo con un
     oggetto di una chiave sola cancellerebbe quello che l'operatore sta guardando. */
  it('CONSERVA il resto del raw_json', () => {
    const r = vociDaAggiornare(
      [voce({ raw_json: { _acea: true, _nuovo: true, note: 'citofonare Rossi' } })],
      mappa,
    );
    expect(r[0].raw_json).toEqual({
      _acea: true, _nuovo: true, note: 'citofonare Rossi', coordinate: '41.1, 13.1',
    });
  });

  it('idempotente: chi ha già quella coordinata non si riscrive', () => {
    expect(vociDaAggiornare([voce({ raw_json: { coordinate: '41.1, 13.1' } })], mappa)).toEqual([]);
  });

  it('una coordinata diversa si corregge', () => {
    expect(vociDaAggiornare([voce({ raw_json: { coordinate: '1.0, 1.0' } })], mappa)).toHaveLength(1);
  });

  /* Le voci degli altri committenti non sono nella mappa (costruita dal solo registro
     acqualatina): restano intatte senza bisogno di filtrarle per committente. */
  it('una voce di un altro committente non viene toccata', () => {
    expect(vociDaAggiornare([voce({ odl: '20044576235', matricola: 'ITGG03420' })], mappa)).toEqual([]);
  });

  it('una voce senza ODL non ha come agganciarsi', () => {
    expect(vociDaAggiornare([voce({ odl: null })], mappa)).toEqual([]);
  });
});
