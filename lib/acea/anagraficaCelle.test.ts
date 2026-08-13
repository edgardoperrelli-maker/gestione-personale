import { describe, expect, it } from 'vitest';
import {
  COLONNE_ANAGRAFICA,
  anagraficaCelleValida,
  eColonnaAnagrafica,
  patchInterventoAnagrafica,
  patchRegistroAnagrafica,
  patchVoceAnagrafica,
  valoreAnagrafica,
} from './anagraficaCelle';

describe('eColonnaAnagrafica', () => {
  it('riconosce le colonne dell’anagrafica del punto', () => {
    for (const c of COLONNE_ANAGRAFICA) expect(eColonnaAnagrafica(c)).toBe(true);
  });

  /*
    Il cuore del perimetro: la chiave e l'identità della riga NON sono anagrafica. Se un domani
    qualcuno le aggiungesse all'elenco, l'incolla in griglia comincerebbe a spostare correzioni
    su righe diverse (odl) o a rompere l'indice unico (odl, matricola_norm).
  */
  it('tiene fuori chiave e identità della riga, e le colonne nostre', () => {
    for (const c of ['odl', 'numero_operazione', 'matricola', 'matricola_nuova', 'note',
      'pianificato_a', 'pianificato_il', 'coordinate', 'stato']) {
      expect(eColonnaAnagrafica(c)).toBe(false);
    }
  });
});

describe('valoreAnagrafica', () => {
  it('porta in MAIUSCOLO e schiaccia gli spazi doppi', () => {
    expect(valoreAnagrafica('comune', ' Terracina ')).toBe('TERRACINA');
    expect(valoreAnagrafica('indirizzo', 'via  Badino   Vecchia 3')).toBe('VIA BADINO VECCHIA 3');
  });

  it('la stringa vuota SVUOTA la cella (null), non scrive una stringa vuota', () => {
    expect(valoreAnagrafica('recapito', '')).toBeNull();
    expect(valoreAnagrafica('recapito', '   ')).toBeNull();
    expect(valoreAnagrafica('recapito', null)).toBeNull();
  });

  it('taglia alla lunghezza massima della colonna invece di rifiutare', () => {
    expect(valoreAnagrafica('cap', '041210123456')).toBe('0412101234');
    expect(valoreAnagrafica('indirizzo', 'A'.repeat(500))?.length).toBe(200);
  });
});

describe('anagraficaCelleValida', () => {
  it('scarta le chiavi ignote — matricola e odl non passano da questa porta', () => {
    const out = anagraficaCelleValida({
      comune: 'terracina', matricola: 'I15BA041721', odl: '999', pippo: 1,
    });
    expect(out).toEqual({ comune: 'TERRACINA' });
  });

  it('distingue «chiave assente» (invariata) da «valore vuoto» (svuotata)', () => {
    expect(anagraficaCelleValida({ nominativo: '' })).toEqual({ nominativo: null });
    expect('nominativo' in anagraficaCelleValida({ comune: 'X' })).toBe(false);
  });

  it('regge un corpo non oggetto senza esplodere', () => {
    expect(anagraficaCelleValida(null)).toEqual({});
    expect(anagraficaCelleValida('ciao')).toEqual({});
  });
});

describe('patchRegistroAnagrafica', () => {
  it('spezza l’indirizzo in via + civico, come il sync dal master', () => {
    expect(patchRegistroAnagrafica({ indirizzo: 'VIA BADINO VECCHIA 12/A' }))
      .toEqual({ via: 'VIA BADINO VECCHIA', civico: '12/A' });
  });

  it('un indirizzo senza civico non se lo inventa', () => {
    expect(patchRegistroAnagrafica({ indirizzo: 'LOCALITA BORGO HERMADA' }))
      .toEqual({ via: 'LOCALITA BORGO HERMADA', civico: null });
  });

  it('svuotare l’indirizzo svuota entrambe le colonne', () => {
    expect(patchRegistroAnagrafica({ indirizzo: null })).toEqual({ via: null, civico: null });
  });

  it('tocca SOLO le colonne presenti nella patch', () => {
    expect(patchRegistroAnagrafica({ cap: '04019' })).toEqual({ cap: '04019' });
    expect(patchRegistroAnagrafica({})).toEqual({});
  });
});

describe('patch verso intervento e voce', () => {
  /*
    Lo stesso dato ha tre nomi lungo la catena: `impianto` a registro, `pdr` sull'intervento e
    sulla voce. È la mappa che `VOCE_TO_INTERVENTO` (lo Storico) percorre nell'altro verso, e
    sbagliarla non darebbe nessun errore — scriverebbe in silenzio su una colonna che non c'è.
  */
  it('impianto diventa pdr a valle', () => {
    expect(patchInterventoAnagrafica({ impianto: '59005302' })).toEqual({ pdr: '59005302' });
    expect(patchVoceAnagrafica({ impianto: '59005302' })).toEqual({ pdr: '59005302' });
  });

  it('l’indirizzo resta intero: `indirizzo` sull’intervento, `via` sulla voce', () => {
    expect(patchInterventoAnagrafica({ indirizzo: 'VIA ROMA 1' })).toEqual({ indirizzo: 'VIA ROMA 1' });
    expect(patchVoceAnagrafica({ indirizzo: 'VIA ROMA 1' })).toEqual({ via: 'VIA ROMA 1' });
  });

  it('senza colonne anagrafiche la patch è vuota: nessun update alla cieca', () => {
    expect(patchInterventoAnagrafica({})).toEqual({});
    expect(patchVoceAnagrafica({})).toEqual({});
  });
});
