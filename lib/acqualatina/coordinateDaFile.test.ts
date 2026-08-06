import { describe, it, expect } from 'vitest';
import {
  abbinaCoordinate, parseCoordinateFile, trovaHeaderCoordinate,
  type OrdineDaCoordinare,
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
