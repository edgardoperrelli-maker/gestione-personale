import { describe, expect, it } from 'vitest';
import { allineamentiDaImport, COMMITTENTE_ALLINEABILE } from './attivitaDaImport';
import { buildTassonomiaIndex, chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';

const riga = (committente: string, descrizione: string, gruppo: string): TassonomiaRiga => ({
  committente,
  descrizione,
  descrizioneNorm: chiaveTassonomia(descrizione),
  gruppo,
  attivo: true,
});

// Sottoinsieme reale del catalogo ACEA (attivita_tassonomia), quello toccato dal caso.
const INDICE = buildTassonomiaIndex([
  riga('acea', 'Rimozione misuratore per morosità', 'DUNNING'),
  riga('acea', 'Rim Mis/Mod radio per morosità', 'DUNNING'),
  riga('acea', 'Riattivazione fornitura', 'DUNNING'),
  riga('acea', 'Limitazione flusso idrico', 'DUNNING'),
  riga('acea', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE'),
]);

const intervento = (
  id: string,
  odl: string | null,
  intervento_tipo: string | null,
  gruppo_attivita: string | null = 'DUNNING',
  committente: string | null = COMMITTENTE_ALLINEABILE,
) => ({ id, odl, committente, intervento_tipo, gruppo_attivita });

describe("allineamentiDaImport — l'attività dell'ordine la dichiara ACEA", () => {
  it("riallinea l'intervento fermo all'attività pianificata", () => {
    // Il caso vero (ODL 957330352, impianto 4003852681): pianificato come rimozione, ACEA lo
    // chiude come riattivazione perché il cliente ha pagato. Senza questo, la matricola entra
    // nel registro Misuratori Rimossi di un contatore mai staccato.
    const out = allineamentiDaImport(
      [{ odl: '957330352', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', '957330352', 'Rimozione misuratore per morosità')],
      INDICE,
    );
    expect(out).toEqual([{
      id: 'i1',
      odl: '957330352',
      intervento_tipo: 'Riattivazione fornitura',
      gruppo_attivita: 'DUNNING',
      tipoPrima: 'Rimozione misuratore per morosità',
    }]);
  });

  it('scrive la forma CANONICA, non il testo del file', () => {
    // A storage va ciò che i gruppi e i flussi sanno leggere: l'alias di scrittura collassa la
    // famiglia massive sulla canonica unica (migration 20260722140000).
    const out = allineamentiDaImport(
      [{ odl: '1', attivita: 'limitazione   massiva su impianto' }],
      [intervento('i1', '1', 'Limitazione flusso idrico')],
      INDICE,
    );
    expect(out[0]).toMatchObject({
      intervento_tipo: 'LIMITAZIONI MASSIVE',
      gruppo_attivita: 'LIMITAZIONI MASSIVE',
    });
  });

  it("un ODL con operazioni discordi non si tocca: quale sarebbe la nostra uscita non si sa", () => {
    const out = allineamentiDaImport(
      [
        { odl: '1', attivita: 'Riattivazione fornitura' },
        { odl: '1', attivita: 'Limitazione flusso idrico' },
      ],
      [intervento('i1', '1', 'Rimozione misuratore per morosità')],
      INDICE,
    );
    expect(out).toEqual([]);
  });

  it("più operazioni che dicono la STESSA cosa restano un allineamento valido", () => {
    // Le scissioni di ODL ripetono la stessa operazione su due numeri: non è un'ambiguità.
    const out = allineamentiDaImport(
      [
        { odl: '1', attivita: 'Riattivazione fornitura' },
        { odl: '1', attivita: 'RIATTIVAZIONE FORNITURA' },
      ],
      [intervento('i1', '1', 'Rimozione misuratore per morosità')],
      INDICE,
    );
    expect(out).toHaveLength(1);
  });

  it("un'attività fuori catalogo non si scrive, e spegne l'ODL", () => {
    // Mai testo grezzo a storage: un `intervento_tipo` non risolvibile perde gruppo e flusso.
    // E se l'ODL ha anche un'operazione nota, l'ignoto resta un dubbio: ci si ferma.
    expect(allineamentiDaImport(
      [{ odl: '1', attivita: 'ATTIVITÀ MAI VISTA' }],
      [intervento('i1', '1', 'Rimozione misuratore per morosità')],
      INDICE,
    )).toEqual([]);
    expect(allineamentiDaImport(
      [{ odl: '1', attivita: 'Riattivazione fornitura' }, { odl: '1', attivita: 'ATTIVITÀ MAI VISTA' }],
      [intervento('i1', '1', 'Rimozione misuratore per morosità')],
      INDICE,
    )).toEqual([]);
  });

  it('`lim_massive` è un canale, non il catalogo DUNNING: non si allinea', () => {
    // Nell'export gli stessi ODL portano il testo dell'ordine tecnico; riallinearli spezzerebbe
    // il gruppo del modulo su interventi già lavorati (spec §4.5).
    const out = allineamentiDaImport(
      [{ odl: '1', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', '1', 'LIMITAZIONI MASSIVE', 'LIMITAZIONI MASSIVE', 'lim_massive')],
      INDICE,
    );
    expect(out).toEqual([]);
  });

  it('un ODL con più uscite le allinea TUTTE', () => {
    // L'export parla dell'ORDINE: allinearne una sola lascerebbe due righe che si contraddicono.
    const out = allineamentiDaImport(
      [{ odl: '1', attivita: 'Riattivazione fornitura' }],
      [
        intervento('i1', '1', 'Rimozione misuratore per morosità'),
        intervento('i2', '1', 'Rim Mis/Mod radio per morosità'),
        intervento('i3', '1', 'Riattivazione fornitura'), // già a posto: fuori
      ],
      INDICE,
    );
    expect(out.map((a) => a.id)).toEqual(['i1', 'i2']);
  });

  it('il gruppo sbagliato basta a far scattare l\'allineamento', () => {
    // Stesso testo, gruppo rimasto indietro: è il gruppo che instrada flussi e moduli.
    const out = allineamentiDaImport(
      [{ odl: '1', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', '1', 'Riattivazione fornitura', null)],
      INDICE,
    );
    expect(out).toHaveLength(1);
    expect(out[0].gruppo_attivita).toBe('DUNNING');
  });

  it('ignora le righe senza ODL, da una parte e dall\'altra', () => {
    expect(allineamentiDaImport(
      [{ odl: '  ', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', '  ', 'Rimozione misuratore per morosità')],
      INDICE,
    )).toEqual([]);
    expect(allineamentiDaImport(
      [{ odl: '1', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', null, 'Rimozione misuratore per morosità')],
      INDICE,
    )).toEqual([]);
  });

  it('gli spazi attorno all\'ODL non impediscono l\'aggancio', () => {
    // Gli ODL passano per celle di Excel: uno spazio in coda è la norma, non l'eccezione.
    const out = allineamentiDaImport(
      [{ odl: ' 957330352 ', attivita: 'Riattivazione fornitura' }],
      [intervento('i1', '957330352 ', 'Rimozione misuratore per morosità')],
      INDICE,
    );
    expect(out).toHaveLength(1);
  });

  it('file senza attività utilizzabili → nessun allineamento', () => {
    expect(allineamentiDaImport(
      [{ odl: '1', attivita: null }, { odl: '2', attivita: '' }],
      [intervento('i1', '1', 'Rimozione misuratore per morosità')],
      INDICE,
    )).toEqual([]);
  });
});
