import { describe, it, expect } from 'vitest';
import {
  COLONNE_DUNNING, COLONNE_MASSIVE, dataIt, valoreCella, tonoScadenza, type RigaTabella,
} from './colonneTabella';
import { COLONNE_ELENCO, COLONNE_TESTO, OPZIONI_VUOTE } from './filtriOrdini';

const riga = (over: Partial<RigaTabella> = {}): RigaTabella => ({
  odl: '912215286', numero_operazione: '0010', famiglia: 'massive', tipo_ordine: 'ASTR',
  attivita: 'Limitazione Massiva su Impianto', stato: 'DAPI', stato_desc: 'Intervento Richiesto',
  aperto: true, data_creazione: '2026-05-22', cardine_al: '2026-10-30', scadenza: null,
  data_completamento: null, operatore_cognome: null, causale: null, causale_desc: null,
  esito_positivo: null, via: 'VIA ALFA', civico: '108', cap: '00039', comune: 'ZAGAROLO',
  impianto: '4003635716', matricola: '201215053510', valore_netto: 25.46,
  escludi_consuntivazione: false, codice_sla: 'NSLA', priorita_testo: null, centro_lavoro: null,
  sospetto_troncamento: false, pianificato_il: null, pianificato_a: null, stato_intervento: null,
  ...over,
});

describe('definizione colonne', () => {
  it('la vista dunning mostra di default le colonne del master più la scadenza', () => {
    const pred = COLONNE_DUNNING.filter((c) => c.predefinita).map((c) => c.chiave);
    expect(pred).toEqual([
      'odl', 'attivita', 'matricola', 'indirizzo', 'comune', 'cap', 'stato',
      'data_creazione', 'scadenza', 'pianificato_a', 'pianificato_il',
    ]);
  });

  it('la vista massive NON ha la colonna scadenza (questi ordini non scadono)', () => {
    expect(COLONNE_MASSIVE.some((c) => c.chiave === 'scadenza')).toBe(false);
  });

  it('nessuna chiave duplicata', () => {
    for (const set of [COLONNE_DUNNING, COLONNE_MASSIVE]) {
      expect(new Set(set.map((c) => c.chiave)).size).toBe(set.length);
    }
  });
});

// I filtri stanno nelle intestazioni (AutoFiltro di Excel) e si applicano lato server: il legame
// fra la colonna cliccata e il campo interrogato vive solo qui, quindi va pinnato.
describe('filtri di colonna', () => {
  const tutte = [...COLONNE_DUNNING, ...COLONNE_MASSIVE];

  it('ogni filtro punta a un campo che il server sa filtrare', () => {
    for (const c of tutte) {
      if (!c.filtro) continue;
      if (c.filtro.tipo === 'elenco') expect(COLONNE_ELENCO).toContain(c.filtro.campo);
      if (c.filtro.tipo === 'testo') expect(COLONNE_TESTO).toContain(c.filtro.campo);
    }
  });

  it('ogni filtro a elenco pesca da un elenco di opzioni che esiste', () => {
    for (const c of tutte) {
      if (c.filtro?.tipo !== 'elenco') continue;
      expect(Object.keys(OPZIONI_VUOTE)).toContain(c.filtro.opzioni);
    }
  });

  // Le due colonne della pianificazione hanno un imbuto di tipo PROPRIO, senza `campo`: il dato non
  // sta nel registro (è nostro, vive in `interventi`), e il server lo incrocia. Il tipo dedicato è
  // ciò che impedisce di trattarle come una colonna qualsiasi e mandare al server un filtro su una
  // colonna che non esiste — che tornerebbe zero righe senza dire perché.
  it('le colonne della pianificazione hanno un imbuto tutto loro', () => {
    const perChiave = (k: string) => tutte.find((c) => c.chiave === k)?.filtro;
    expect(perChiave('pianificato_a')).toEqual({ tipo: 'esecutore' });
    expect(perChiave('pianificato_il')).toEqual({ tipo: 'data_pianificata' });
  });

  // La regola di onestà resta: un filtro che punta a una colonna del registro DEVE essere una
  // colonna che il server sa filtrare. Le due della pianificazione sono l'eccezione dichiarata,
  // non una scappatoia — e non portano `campo` proprio per non poterla usare per sbaglio.
  it('nessun filtro con `campo` punta a una colonna inesistente', () => {
    for (const c of tutte) {
      if (c.filtro?.tipo === 'esecutore' || c.filtro?.tipo === 'data_pianificata') {
        expect(c.filtro).not.toHaveProperty('campo');
      }
    }
  });

  it('la scadenza ha il filtro semantico, e solo dove la colonna esiste', () => {
    expect(COLONNE_DUNNING.find((c) => c.chiave === 'scadenza')?.filtro)
      .toEqual({ tipo: 'scadenza' });
    expect(COLONNE_MASSIVE.some((c) => c.filtro?.tipo === 'scadenza')).toBe(false);
  });

  // Il CAP è il taglio più fine che ACEA dà sul territorio, ed è quello su cui si decide dove
  // mandare una squadra: «Roma» non dice quanto sono distanti due misuratori, «Roma 00139» sì.
  it('il CAP c’è in entrambe le viste, di default e con l’elenco dei valori', () => {
    for (const colonne of [COLONNE_DUNNING, COLONNE_MASSIVE]) {
      const cap = colonne.find((c) => c.chiave === 'cap');
      expect(cap?.predefinita).toBe(true);
      // A elenco e non a testo: si spuntano i CAP confinanti su cui mandare la squadra, e si vede
      // quali esistono davvero nel registro invece di indovinarli uno alla volta.
      expect(cap?.filtro).toEqual({ tipo: 'elenco', campo: 'cap', opzioni: 'cap' });
    }
  });

  it('la stessa colonna filtra lo stesso campo nelle due viste', () => {
    for (const d of COLONNE_DUNNING) {
      const m = COLONNE_MASSIVE.find((c) => c.chiave === d.chiave);
      if (m) expect(m.filtro).toEqual(d.filtro);
    }
  });
});

describe('dataIt', () => {
  it('converte ISO in formato italiano', () => {
    expect(dataIt('2026-07-26')).toBe('26/07/2026');
  });
  it('null e valori non ISO restano leggibili', () => {
    expect(dataIt(null)).toBe('—');
    expect(dataIt('')).toBe('—');
    expect(dataIt('domani')).toBe('domani');
  });
});

describe('valoreCella', () => {
  it('mostra il numero operazione solo quando distingue qualcosa', () => {
    // Un ODL con la sola operazione 0010 non ha bisogno del suffisso: sarebbe rumore su ogni riga.
    expect(valoreCella(riga(), 'odl')).toBe('912215286');
    expect(valoreCella(riga({ numero_operazione: '0050' }), 'odl')).toBe('912215286/0050');
  });

  it('compone l\'indirizzo da via e civico', () => {
    expect(valoreCella(riga(), 'indirizzo')).toBe('VIA ALFA 108');
    expect(valoreCella(riga({ via: null, civico: null }), 'indirizzo')).toBe('—');
    expect(valoreCella(riga({ civico: null }), 'indirizzo')).toBe('VIA ALFA');
  });

  it('preferisce la descrizione dello stato al codice', () => {
    expect(valoreCella(riga(), 'stato')).toBe('Intervento Richiesto');
    expect(valoreCella(riga({ stato_desc: null }), 'stato')).toBe('DAPI');
  });

  it('l\'esito usa la causale ACEA quando c\'è', () => {
    expect(valoreCella(riga(), 'esito')).toBe('—');   // non ancora esitato
    expect(valoreCella(riga({ esito_positivo: true, causale_desc: 'Intervento Eseguito' }), 'esito'))
      .toBe('Intervento Eseguito');
    expect(valoreCella(riga({ esito_positivo: false, causale_desc: null, causale: null }), 'esito'))
      .toBe('Non eseguito');
  });

  it('formatta importi e date', () => {
    expect(valoreCella(riga(), 'valore_netto')).toBe('25.46');
    expect(valoreCella(riga({ valore_netto: null }), 'valore_netto')).toBe('—');
    expect(valoreCella(riga(), 'data_creazione')).toBe('22/05/2026');
    expect(valoreCella(riga({ pianificato_il: '2026-07-27' }), 'pianificato_il')).toBe('27/07/2026');
  });
});

describe('tonoScadenza', () => {
  const oggi = '2026-07-26';

  it('scaduto solo se l\'ordine è ancora APERTO', () => {
    // Una riga già completata in ritardo non è un problema di oggi: colorarla di rosso
    // renderebbe illeggibile lo storico.
    expect(tonoScadenza(riga({ scadenza: '2026-07-20', aperto: true }), oggi)).toBe('scaduto');
    expect(tonoScadenza(riga({ scadenza: '2026-07-20', aperto: false }), oggi)).toBe('nessuna');
  });

  it('distingue oggi, vicino e lontano', () => {
    expect(tonoScadenza(riga({ scadenza: '2026-07-26' }), oggi)).toBe('oggi');
    expect(tonoScadenza(riga({ scadenza: '2026-07-29' }), oggi)).toBe('vicino');
    expect(tonoScadenza(riga({ scadenza: '2026-07-30' }), oggi)).toBe('lontano');
  });

  it('le massive non hanno tono: non scadono', () => {
    expect(tonoScadenza(riga({ scadenza: null }), oggi)).toBe('nessuna');
  });
});
