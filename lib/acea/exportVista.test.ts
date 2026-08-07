import { describe, it, expect } from 'vitest';
import {
  MAX_RIGHE_EXPORT, PER_PAGINA_EXPORT, dedupRigheExport, nomeFileExport, nomeFoglioExport,
  pagineExport, serialeExcel, tracciatoRichiesta,
} from './exportVista';

describe('dedupRigheExport', () => {
  const r = (odl: string, op: string) => ({ odl, numero_operazione: op });

  it('la stessa riga due volte finisce nel foglio una sola volta', () => {
    const out = dedupRigheExport([r('12381328', '1'), r('12381328', '1'), r('12386351', '1')]);
    expect(out.righe).toEqual([r('12381328', '1'), r('12386351', '1')]);
    expect(out.scartate).toBe(1);
  });

  it('tiene la PRIMA occorrenza, non l’ultima', () => {
    const primo = { odl: 'A', numero_operazione: '1', nota: 'primo' };
    const secondo = { odl: 'A', numero_operazione: '1', nota: 'secondo' };
    expect(dedupRigheExport([primo, secondo]).righe).toEqual([primo]);
  });

  // Il caso che rende obbligatoria la coppia: un ODL può avere più operazioni, e sono lavoro
  // diverso. Deduplicare sul solo ODL cancellerebbe righe vere.
  it('due operazioni dello stesso ODL NON sono un doppione', () => {
    const out = dedupRigheExport([r('12381328', '1'), r('12381328', '2')]);
    expect(out.righe).toHaveLength(2);
    expect(out.scartate).toBe(0);
  });

  // Le righe della vista massive che vengono da `interventi` hanno odl '' e numero_operazione =
  // id: restano distinte. Ma se entrambi mancassero non si può dire che siano la stessa riga.
  it('righe senza identità si tengono tutte, non si scartano al buio', () => {
    const out = dedupRigheExport([r('', ''), r('', ''), r('', '')]);
    expect(out.righe).toHaveLength(3);
    expect(out.scartate).toBe(0);
  });

  it('elenco già pulito: nessuno scarto e stesso ordine', () => {
    const righe = [r('A', '1'), r('B', '1'), r('C', '2')];
    const out = dedupRigheExport(righe);
    expect(out.righe).toEqual(righe);
    expect(out.scartate).toBe(0);
  });

  it('elenco vuoto', () => {
    expect(dedupRigheExport([])).toEqual({ righe: [], scartate: 0 });
  });
});

describe('pagineExport', () => {
  it('copre tutte le righe, ultima pagina parziale compresa', () => {
    // 5.293 righe a 500 per volta: 11 richieste, l'ultima con 293 righe. È il caso reale del
    // registro, ed è quello che prima usciva come un file da 300 righe.
    const pagine = pagineExport(5293);
    expect(pagine).toHaveLength(11);
    expect(pagine.at(0)).toBe(1);
    expect(pagine.at(-1)).toBe(11);
    expect((pagine.length - 1) * PER_PAGINA_EXPORT).toBeLessThan(5293);
  });

  it('una pagina esatta non ne aggiunge una vuota', () => {
    expect(pagineExport(500)).toEqual([1]);
    expect(pagineExport(1000)).toEqual([1, 2]);
  });

  it('meno di una pagina resta una pagina', () => {
    expect(pagineExport(1)).toEqual([1]);
    expect(pagineExport(499)).toEqual([1]);
  });

  it('senza righe non chiede niente', () => {
    expect(pagineExport(0)).toEqual([]);
    expect(pagineExport(-3)).toEqual([]);
    expect(pagineExport(Number.NaN)).toEqual([]);
  });

  it('il tetto è abbastanza alto da non incontrarsi sul registro attuale', () => {
    expect(MAX_RIGHE_EXPORT).toBeGreaterThan(5293);
  });
});

describe('nomeFileExport', () => {
  const base = { famiglia: 'dunning', stato: 'aperti', oggi: '2026-07-27', filtrato: false } as const;

  it('porta famiglia, stato e giorno', () => {
    expect(nomeFileExport(base)).toBe('acea-dunning-aperti-20260727.xlsx');
  });

  it('lo stato compare SEMPRE, anche quello di partenza', () => {
    // La vista iniziale è già ristretta agli aperti: un file chiamato `acea-dunning-<data>` farebbe
    // credere che dentro ci sia tutto il registro della famiglia.
    for (const stato of ['tutti', 'aperti', 'chiusi'] as const) {
      expect(nomeFileExport({ ...base, stato })).toContain(`-${stato}-`);
    }
  });

  it('marca il file quando i filtri hanno ristretto la vista', () => {
    expect(nomeFileExport({ ...base, filtrato: true })).toBe('acea-dunning-aperti-20260727-filtrato.xlsx');
  });

  it('senza un giorno valido salta il segmento invece di scrivere una data finta', () => {
    expect(nomeFileExport({ ...base, oggi: '' })).toBe('acea-dunning-aperti.xlsx');
    expect(nomeFileExport({ ...base, oggi: '27/07/2026' })).toBe('acea-dunning-aperti.xlsx');
  });

  it('distingue le due famiglie', () => {
    expect(nomeFileExport({ ...base, famiglia: 'massive' })).toContain('acea-massive-');
  });

  it('la scheda-comune entra nel nome: il file di un paese deve dirlo', () => {
    expect(nomeFileExport({ ...base, famiglia: 'massive', comune: 'ZAGAROLO' }))
      .toBe('acea-massive-zagarolo-aperti-20260727.xlsx');
    // Gli spazi diventano trattini: 'RIGNANO FLAMINIO' non deve produrre un nome con spazi.
    expect(nomeFileExport({ ...base, famiglia: 'massive', comune: 'RIGNANO FLAMINIO' }))
      .toBe('acea-massive-rignano-flaminio-aperti-20260727.xlsx');
  });

  it('senza scheda-comune il nome resta quello di sempre', () => {
    expect(nomeFileExport({ ...base, comune: null })).toBe('acea-dunning-aperti-20260727.xlsx');
  });

  it('acqualatina NON sta sotto il prefisso acea: è un altro committente', () => {
    // «acea-acqualatina-…» direbbe il committente sbagliato a chi ritrova il file fra mesi.
    expect(nomeFileExport({ ...base, famiglia: 'acqualatina' }))
      .toBe('acqualatina-aperti-20260727.xlsx');
  });
});

describe('nomeFileExport — la selezione', () => {
  const base = { famiglia: 'massive', stato: 'chiusi', oggi: '2026-08-06', filtrato: false } as const;

  it('dice che dentro ci sono le righe spuntate, non la vista', () => {
    // Quindici righe in un file chiamato `acea-massive-chiusi-20260806.xlsx` dicono che quelli
    // SONO i chiusi: chi lo riapre fra un mese non ha modo di sapere che erano una selezione.
    expect(nomeFileExport({ ...base, selezione: true }))
      .toBe('acea-massive-chiusi-20260806-selezione.xlsx');
  });

  it('«selezione» copre «filtrato»: è la restrizione più stretta, e si dice una volta sola', () => {
    expect(nomeFileExport({ ...base, filtrato: true, selezione: true }))
      .toBe('acea-massive-chiusi-20260806-selezione.xlsx');
  });

  it('senza selezione il nome resta quello di sempre', () => {
    expect(nomeFileExport({ ...base, selezione: false }))
      .toBe('acea-massive-chiusi-20260806.xlsx');
    expect(nomeFileExport({ ...base, filtrato: true }))
      .toBe('acea-massive-chiusi-20260806-filtrato.xlsx');
  });
});

describe('serialeExcel', () => {
  it('dà il numero con cui Excel rappresenta il giorno', () => {
    // 25569 = 01/01/1970, il valore di controllo classico dell'epoca Excel; 45292 = 01/01/2024.
    expect(serialeExcel('1970-01-01')).toBe(25569);
    expect(serialeExcel('2024-01-01')).toBe(45292);
  });

  it('ordina come ordina il calendario — che è tutto il punto', () => {
    // Da testo, '02/01/2027' finisce PRIMA di '10/12/2026': confronta i caratteri, e '0' < '1'.
    const dicembre = serialeExcel('2026-12-10')!;
    const gennaio = serialeExcel('2027-01-02')!;
    expect(gennaio).toBeGreaterThan(dicembre);
  });

  it('giorni consecutivi distano uno', () => {
    expect(serialeExcel('2026-08-07')! - serialeExcel('2026-08-06')!).toBe(1);
    // A cavallo del mese e dell'anno, dove un calcolo a mano sbaglia.
    expect(serialeExcel('2026-03-01')! - serialeExcel('2026-02-28')!).toBe(1);
    expect(serialeExcel('2027-01-01')! - serialeExcel('2026-12-31')!).toBe(1);
  });

  it('è un intero: una data di calendario non ha un’ora', () => {
    // Il fuso non entra nel calcolo (tutto in UTC): entrandoci, ogni export a ovest di Greenwich
    // scalerebbe di un giorno.
    for (const iso of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(Number.isInteger(serialeExcel(iso))).toBe(true);
    }
  });

  it('quello che non è una data resta fuori', () => {
    for (const v of [null, undefined, '', '—', '06/08/2026', '2026-8-6', 'domani']) {
      expect(serialeExcel(v)).toBeNull();
    }
  });
});

describe('tracciatoRichiesta', () => {
  it('la richiesta ad ACEA porta l’esecutore accanto alla data intervento', () => {
    // Un file che dice quando ci siamo stati ma non chi costringe a ricostruirlo da noi ogni
    // volta che ACEA contesta una saracinesca.
    const chiavi = tracciatoRichiesta('per_acea').map((c) => c.chiave);
    expect(chiavi).toContain('pianificato_a');
    expect(chiavi.indexOf('pianificato_a')).toBe(chiavi.indexOf('pianificato_il') + 1);
  });

  it('«Da esitare» no: là il lavoro non è ancora stato fatto, un esecutore non c’è', () => {
    expect(tracciatoRichiesta('da_esitare').map((c) => c.chiave)).not.toContain('pianificato_a');
  });

  it('niente note né gruppo di giro: il file esce dall’azienda', () => {
    for (const sara of ['per_acea', 'da_esitare'] as const) {
      const chiavi = tracciatoRichiesta(sara).map((c) => c.chiave);
      expect(chiavi).not.toContain('note');
      expect(chiavi).not.toContain('gruppo');
    }
  });
});

describe('nomeFoglioExport', () => {
  it('dunning e massive: il foglio si chiama ACEA, il committente vero', () => {
    expect(nomeFoglioExport('dunning')).toBe('ACEA');
    expect(nomeFoglioExport('massive')).toBe('ACEA');
  });

  it('acqualatina: il foglio dice AcquaLatina, non ACEA', () => {
    // La tab interna era rimasta 'ACEA' anche qui — chi apriva l'export della commessa
    // AcquaLatina si ritrovava righe di `acqualatina_ordini` sotto un foglio intitolato ACEA.
    expect(nomeFoglioExport('acqualatina')).toBe('AcquaLatina');
  });
});
