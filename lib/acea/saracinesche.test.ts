import { describe, it, expect } from 'vitest';
import {
  chiaviAggancio, isAttivitaSaracinesca, statiSaracinesche, valoreDaRichiedere,
  type Dichiarazione, type OrdineSostituzione,
} from './saracinesche';

const dich = (over: Partial<Dichiarazione> = {}): Dichiarazione => ({
  odl: '912215286', impianto: '4000308907', matricola: '202415647231', famiglia: 'massive',
  data: '2026-06-04', operatore: 'MARIO ROSSI', comune: 'LABICO', ...over,
});

const ord = (over: Partial<OrdineSostituzione> = {}): OrdineSostituzione => ({
  odl: '4100000001', numero_operazione: '0010', impianto: '4000308907',
  matricola: '202415647231', famiglia: 'massive', aperto: false, stato: 'COMP',
  data_creazione: '2026-06-20', comune: 'LABICO', ...over,
});

describe('isAttivitaSaracinesca', () => {
  it('riconosce l attività vera dell export', () => {
    expect(isAttivitaSaracinesca('Sostituzione saracinesca o valvola')).toBe(true);
  });

  it('non si fa ingannare dalle altre attività ACEA', () => {
    for (const a of [
      'Limitazione Massiva su Impianto', 'Limitazione flusso idrico',
      'Riattivazione fornitura', 'Rimozione impianto abusivo',
      'Rimozione misuratore per morosità', 'Regolarizzazione flusso idrico',
    ]) {
      expect(isAttivitaSaracinesca(a)).toBe(false);
    }
  });

  it('regge vuoto e null', () => {
    expect(isAttivitaSaracinesca(null)).toBe(false);
    expect(isAttivitaSaracinesca('')).toBe(false);
  });
});

describe('chiaviAggancio', () => {
  it('produce entrambe le chiavi quando ci sono', () => {
    expect(chiaviAggancio({ impianto: '4000308907', matricola: '2024-15647231' }))
      .toEqual(['I:4000308907', 'M:202415647231']);
  });

  it('normalizza la matricola: le 26 forme di scrittura convergono', () => {
    expect(chiaviAggancio({ impianto: null, matricola: '04-228458' })).toEqual(['M:04228458']);
    expect(chiaviAggancio({ impianto: null, matricola: 'mis-e392-3017' })).toEqual(['M:MISE3923017']);
  });

  it('senza misuratore non aggancia niente', () => {
    expect(chiaviAggancio({ impianto: null, matricola: null })).toEqual([]);
    expect(chiaviAggancio({ impianto: '  ', matricola: '---' })).toEqual([]);
  });
});

describe('statiSaracinesche', () => {
  it('dichiarazione con ordine chiuso: coperta, niente da chiedere', () => {
    const r = statiSaracinesche({ dichiarazioni: [dich()], ordini: [ord()] });
    expect(r).toMatchObject({ fatte: 1, coperte: 1, daRichiedere: 0, daEsitare: 0 });
    expect(r.dichiarazioni[0]).toMatchObject({
      stato: 'coperta', odl_sostituzione: '4100000001', sostituzione_aperta: false,
    });
  });

  it('dichiarazione senza alcun ordine: da richiedere', () => {
    const r = statiSaracinesche({ dichiarazioni: [dich()], ordini: [] });
    expect(r).toMatchObject({ fatte: 1, coperte: 0, daRichiedere: 1 });
    expect(r.dichiarazioni[0]).toMatchObject({ stato: 'da_richiedere', odl_sostituzione: null });
  });

  it('ordine aperto: la dichiarazione è coperta e l ordine è da esitare', () => {
    const r = statiSaracinesche({
      dichiarazioni: [dich()],
      ordini: [ord({ aperto: true, stato: 'DAPI' })],
    });
    expect(r).toMatchObject({ fatte: 1, coperte: 1, daRichiedere: 0, daEsitare: 1 });
    expect(r.dichiarazioni[0].sostituzione_aperta).toBe(true);
  });

  it('un ordine aperto senza dichiarazione conta comunque fra i da esitare', () => {
    // I due insiemi non si sommano: gli 80 aperti sono errori noti da chiudere, che ci sia o
    // meno una saracinesca dichiarata sotto.
    const r = statiSaracinesche({
      dichiarazioni: [],
      ordini: [ord({ aperto: true, stato: 'DAPI', impianto: '4009999999', matricola: '999' })],
    });
    expect(r).toMatchObject({ fatte: 0, daRichiedere: 0, daEsitare: 1 });
  });

  it('aggancia per matricola quando gli impianti non si conoscono', () => {
    const r = statiSaracinesche({
      dichiarazioni: [dich({ impianto: null, matricola: '2024-15647231' })],
      ordini: [ord({ impianto: null, matricola: '202415647231' })],
    });
    expect(r.coperte).toBe(1);
  });

  it('aggancia per impianto anche se le matricole sono scritte in modo diverso', () => {
    const r = statiSaracinesche({
      dichiarazioni: [dich({ matricola: 'MIS-E392-3017' })],
      ordini: [ord({ matricola: '202415647231' })],
    });
    expect(r.coperte).toBe(1);
  });

  it('due dichiarazioni sullo stesso misuratore valgono una: la saracinesca si paga una volta', () => {
    const r = statiSaracinesche({
      dichiarazioni: [
        dich({ odl: 'A', data: '2026-07-10' }),
        dich({ odl: 'B', data: '2026-06-04' }),
      ],
      ordini: [],
    });
    expect(r.fatte).toBe(1);
    // Si tiene la più vecchia: è da quel giorno che il lavoro è a credito.
    expect(r.dichiarazioni[0]).toMatchObject({ odl: 'B', data: '2026-06-04' });
  });

  it('senza misuratore la dichiarazione sopravvive, deduplicata per ODL', () => {
    const senza = { impianto: null, matricola: null };
    const r = statiSaracinesche({
      dichiarazioni: [
        dich({ odl: 'A', ...senza }), dich({ odl: 'A', ...senza }), dich({ odl: 'B', ...senza }),
      ],
      ordini: [],
    });
    expect(r.fatte).toBe(2);
    expect(r.daRichiedere).toBe(2);
  });

  it('sullo stesso misuratore un ordine aperto batte uno già esitato', () => {
    const r = statiSaracinesche({
      dichiarazioni: [dich()],
      ordini: [ord({ odl: 'CHIUSO' }), ord({ odl: 'APERTO', aperto: true, stato: 'DAPI' })],
    });
    expect(r.dichiarazioni[0]).toMatchObject({ odl_sostituzione: 'APERTO', sostituzione_aperta: true });
    expect(r.daEsitare).toBe(1);
  });

  it('ordina le dichiarazioni dalla più vecchia, e le date assenti in fondo', () => {
    const r = statiSaracinesche({
      dichiarazioni: [
        dich({ odl: 'C', impianto: '3', data: null }),
        dich({ odl: 'A', impianto: '1', data: '2026-07-20' }),
        dich({ odl: 'B', impianto: '2', data: '2026-05-01' }),
      ],
      ordini: [],
    });
    expect(r.dichiarazioni.map((d) => d.odl)).toEqual(['B', 'A', 'C']);
  });

  it('senza dati non produce numeri inventati', () => {
    expect(statiSaracinesche({ dichiarazioni: [], ordini: [] })).toMatchObject({
      fatte: 0, coperte: 0, daRichiedere: 0, daEsitare: 0,
    });
  });
});

describe('statiSaracinesche · filtro per famiglia', () => {
  it('il filtro NON inventa da richiedere: l aggancio si fa prima, sulla popolazione intera', () => {
    // La trappola: la saracinesca è dichiarata su un dunning, l'ordine che la copre è per tipo una
    // manutenzione straordinaria (massive). Filtrando gli ordini a monte la dichiarazione
    // risulterebbe scoperta — e si andrebbe a richiedere ad ACEA un ordine che esiste già.
    const args = {
      dichiarazioni: [dich({ famiglia: 'dunning' as const })],
      ordini: [ord({ famiglia: 'massive' as const })],
    };
    expect(statiSaracinesche({ ...args, famiglia: 'dunning' })).toMatchObject({
      fatte: 1, coperte: 1, daRichiedere: 0,
    });
  });

  it('separa le due famiglie e i totali tornano', () => {
    const args = {
      dichiarazioni: [
        dich({ odl: 'D1', impianto: '1', famiglia: 'dunning' as const }),
        dich({ odl: 'M1', impianto: '2', famiglia: 'massive' as const }),
        dich({ odl: 'M2', impianto: '3', famiglia: 'massive' as const }),
      ],
      ordini: [],
    };
    expect(statiSaracinesche({ ...args, famiglia: 'dunning' }).fatte).toBe(1);
    expect(statiSaracinesche({ ...args, famiglia: 'massive' }).fatte).toBe(2);
    expect(statiSaracinesche(args).fatte).toBe(3);
  });

  it('un ordine aperto si mostra sotto la famiglia della saracinesca che copre', () => {
    const args = {
      dichiarazioni: [dich({ famiglia: 'dunning' as const })],
      ordini: [ord({ famiglia: 'massive' as const, aperto: true, stato: 'DAPI' })],
    };
    expect(statiSaracinesche({ ...args, famiglia: 'dunning' }).daEsitare).toBe(1);
    expect(statiSaracinesche({ ...args, famiglia: 'massive' }).daEsitare).toBe(0);
    expect(statiSaracinesche({ ...args, famiglia: 'dunning' }).ordiniAperti[0])
      .toMatchObject({ famiglia_vista: 'dunning', odl_dichiarazione: '912215286' });
  });

  it('un ordine aperto senza dichiarazione resta sotto la propria famiglia', () => {
    const r = statiSaracinesche({
      dichiarazioni: [],
      ordini: [ord({ aperto: true, stato: 'DAPI', impianto: '999', matricola: null })],
      famiglia: 'massive',
    });
    expect(r.daEsitare).toBe(1);
    expect(r.ordiniAperti[0]).toMatchObject({ famiglia_vista: 'massive', odl_dichiarazione: null });
  });
});

describe('valoreDaRichiedere', () => {
  it('applica la tariffa di listino', () => {
    expect(valoreDaRichiedere(634)).toBe(57770.08);
    expect(valoreDaRichiedere(0)).toBe(0);
  });
});
