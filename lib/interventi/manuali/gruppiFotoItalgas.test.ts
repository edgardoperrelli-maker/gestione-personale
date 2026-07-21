import { describe, it, expect } from 'vitest';
import {
  raggruppaPerVia,
  richiesteDelGruppo,
  viaRisoltaRichiesta,
  normalizzaViaChiave,
  type RichiestaItalgas,
  type ViaVoce,
} from './gruppiFotoItalgas';

const r = (p: Partial<RichiestaItalgas>): RichiestaItalgas => ({
  id: 'r1', parentVoceId: null, viaAnagrafica: 'VIA ROMA 12', matricola: '2409539', ...p,
});

describe('viaRisoltaRichiesta', () => {
  it('parent risolve con via → usa la via del contenitore (assegnata dall\'ufficio)', () => {
    const voci = new Map<string, ViaVoce>([['v1', { id: 'v1', via: 'VIA TREVI 30' }]]);
    expect(viaRisoltaRichiesta(r({ parentVoceId: 'v1', viaAnagrafica: 'VIA TREVI 28' }), voci)).toBe('VIA TREVI 30');
  });

  it('parent assente (null) → usa la via dell\'anagrafica della richiesta', () => {
    expect(viaRisoltaRichiesta(r({ parentVoceId: null, viaAnagrafica: 'VIA DEL PALLONE 4' }), new Map())).toBe('VIA DEL PALLONE 4');
  });

  it('parent ORFANO (punta a una voce non più esistente) → fallback alla via dell\'anagrafica', () => {
    const voci = new Map<string, ViaVoce>(); // la voce puntata non c'è (cancellata/rigenerata)
    expect(viaRisoltaRichiesta(r({ parentVoceId: 'sparita', viaAnagrafica: 'VIA EUGENIO MONTALE 21' }), voci)).toBe('VIA EUGENIO MONTALE 21');
  });

  it('parent risolve ma senza via valorizzata → fallback alla via dell\'anagrafica', () => {
    const voci = new Map<string, ViaVoce>([['v1', { id: 'v1', via: '  ' }]]);
    expect(viaRisoltaRichiesta(r({ parentVoceId: 'v1', viaAnagrafica: 'VIA ROMA 12' }), voci)).toBe('VIA ROMA 12');
  });
});

describe('raggruppaPerVia', () => {
  it('caso ANNACCARATO: parent orfano per 8 richieste + 4 senza parent → 2 gruppi per via, non 0', () => {
    const voci = new Map<string, ViaVoce>(); // nessuna voce risolve: tutte orfane o assenti
    const richieste = [
      ...Array.from({ length: 8 }, (_, i) => r({ id: `montale${i}`, parentVoceId: 'sparita', viaAnagrafica: 'VIA EUGENIO MONTALE 21' })),
      ...Array.from({ length: 4 }, (_, i) => r({ id: `bocce${i}`, parentVoceId: null, viaAnagrafica: 'VIA DELLE BOCCE 19' })),
    ];
    const gruppi = raggruppaPerVia(richieste, voci);
    expect(gruppi).toHaveLength(2);
    const perVia = Object.fromEntries(gruppi.map((g) => [g.via, g.richiestaIds.length]));
    expect(perVia['VIA EUGENIO MONTALE 21']).toBe(8);
    expect(perVia['VIA DELLE BOCCE 19']).toBe(4);
  });

  it('caso TODINI: nessun parent, via diverse (con/senza civico) → gruppi distinti', () => {
    const richieste = [
      r({ id: 'a', parentVoceId: null, viaAnagrafica: 'VIA DEL PALLONE 4' }),
      r({ id: 'b', parentVoceId: null, viaAnagrafica: 'VIA DEL PALLONE 4' }),
      r({ id: 'c', parentVoceId: null, viaAnagrafica: 'VIA DEL PALLONE 4' }),
      r({ id: 'd', parentVoceId: null, viaAnagrafica: 'VIA DEL PALLONE' }),
    ];
    const gruppi = raggruppaPerVia(richieste, new Map());
    expect(gruppi).toHaveLength(2);
    expect(gruppi.find((g) => g.via === 'VIA DEL PALLONE 4')?.richiestaIds).toHaveLength(3);
    expect(gruppi.find((g) => g.via === 'VIA DEL PALLONE')?.richiestaIds).toHaveLength(1);
  });

  it('collegamento valido (parent risolve) → raggruppa per la via del contenitore', () => {
    const voci = new Map<string, ViaVoce>([['v1', { id: 'v1', via: 'VIA GALILEO GALILEI 15' }]]);
    const richieste = [
      r({ id: 'a', parentVoceId: 'v1', viaAnagrafica: 'VIA GALILEO GALILEI 15' }),
      r({ id: 'b', parentVoceId: 'v1', viaAnagrafica: 'via galileo galilei 15' }), // maiuscole diverse
    ];
    const gruppi = raggruppaPerVia(richieste, voci);
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].richiestaIds).toEqual(['a', 'b']);
  });

  it('via assente ovunque → un gruppo con via null', () => {
    const gruppi = raggruppaPerVia([r({ id: 'a', viaAnagrafica: null })], new Map());
    expect(gruppi).toEqual([{ via: null, richiestaIds: ['a'] }]);
  });

  it('lista vuota → nessun gruppo', () => {
    expect(raggruppaPerVia([], new Map())).toEqual([]);
  });
});

describe('richiesteDelGruppo', () => {
  it('filtra case/spazi-insensitive sulla via risolta', () => {
    const richieste = [
      r({ id: 'a', viaAnagrafica: 'via  del pallone   4' }),
      r({ id: 'b', viaAnagrafica: 'VIA DEL PALLONE 4' }),
      r({ id: 'c', viaAnagrafica: 'VIA DEL PALLONE' }),
    ];
    const sel = richiesteDelGruppo(richieste, new Map(), 'VIA DEL PALLONE 4');
    expect(sel.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('filtro null → seleziona solo le richieste senza via', () => {
    const richieste = [r({ id: 'a', viaAnagrafica: null }), r({ id: 'b', viaAnagrafica: 'VIA ROMA 12' })];
    expect(richiesteDelGruppo(richieste, new Map(), null).map((x) => x.id)).toEqual(['a']);
  });
});

describe('normalizzaViaChiave', () => {
  it('trim, spazi multipli collassati, maiuscolo', () => {
    expect(normalizzaViaChiave('  via  del   pallone  4 ')).toBe('VIA DEL PALLONE 4');
  });
  it('null/undefined → stringa vuota', () => {
    expect(normalizzaViaChiave(null)).toBe('');
    expect(normalizzaViaChiave(undefined)).toBe('');
  });
});
