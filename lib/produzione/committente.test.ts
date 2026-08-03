import { describe, expect, it } from 'vitest';
import {
  commessaDi,
  commesseDi,
  committentiGrezzi,
  haContabilizzazione,
  inVista,
  vistaDaParam,
} from './committente';

describe('committentiGrezzi — cosa pesca la query', () => {
  it('ACEA porta con sé le limitazioni massive', () => {
    // `lim_massive` diventa ACEA solo a valle, in attivitaCanonica: se la query non lo tira su,
    // a valle non ci arriva mai e sparirebbero i comuni con master (Labico, Zagarolo, …).
    expect(committentiGrezzi('acea')).toEqual(['acea', 'lim_massive']);
  });

  it('AcquaLatina è solo sé stessa', () => {
    expect(committentiGrezzi('acqualatina')).toEqual(['acqualatina']);
  });

  it('«Tutti» è la somma, senza duplicati', () => {
    const g = committentiGrezzi('tutti');
    expect(g).toEqual(['acea', 'lim_massive', 'acqualatina']);
    expect(new Set(g).size).toBe(g.length);
  });
});

describe('commessaDi — dal committente effettivo alla commessa', () => {
  it('riconosce le due commesse valorizzate', () => {
    expect(commessaDi('acea')).toBe('acea');
    expect(commessaDi('acqualatina')).toBe('acqualatina');
  });

  it('italgas è FUORI: ha una contabilità sua', () => {
    // L'alias usa `italgas` anche come discarica dei lavori ACEA non remunerati (il gas, le righe
    // senza attività nei comuni senza master): finissero in una commessa, la produzione crescerebbe
    // di lavoro che nessuno paga su questo listino.
    expect(commessaDi('italgas')).toBeNull();
    expect(commessaDi('')).toBeNull();
    expect(commessaDi(null)).toBeNull();
  });

  it('non guarda maiuscole né spazi', () => {
    expect(commessaDi(' AcquaLatina ')).toBe('acqualatina');
  });
});

describe('inVista — chi entra in cosa', () => {
  it('la vista di una commessa tiene fuori l\'altra', () => {
    expect(inVista('acea', 'acea')).toBe(true);
    expect(inVista('acea', 'acqualatina')).toBe(false);
    expect(inVista('acqualatina', 'acea')).toBe(false);
    expect(inVista('acqualatina', 'acqualatina')).toBe(true);
  });

  it('«Tutti» prende entrambe ma NON italgas', () => {
    expect(inVista('tutti', 'acea')).toBe(true);
    expect(inVista('tutti', 'acqualatina')).toBe(true);
    expect(inVista('tutti', 'italgas')).toBe(false);
  });
});

describe('vistaDaParam — il filtro arriva dall\'URL', () => {
  it('legge le tre viste', () => {
    expect(vistaDaParam('tutti')).toBe('tutti');
    expect(vistaDaParam('acea')).toBe('acea');
    expect(vistaDaParam('ACQUALATINA')).toBe('acqualatina');
  });

  it('assente o incomprensibile → «Tutti», mai una commessa a caso', () => {
    // Un param rotto che cadesse su 'acea' mostrerebbe un totale parziale con l'aria di essere
    // completo: il default deve essere il numero più grande, quello che nessuno scambia per altro.
    for (const raw of [null, undefined, '', '  ', 'italgas', 'acquala']) {
      expect(vistaDaParam(raw)).toBe('tutti');
    }
  });
});

describe('haContabilizzazione — SAL e portale sono roba ACEA', () => {
  it('AcquaLatina non ha portale: niente SAL, niente scarto', () => {
    expect(haContabilizzazione('acqualatina')).toBe(false);
  });

  it('ACEA e «Tutti» ce l\'hanno (su «Tutti» va intestata ad ACEA)', () => {
    expect(haContabilizzazione('acea')).toBe(true);
    expect(haContabilizzazione('tutti')).toBe(true);
  });
});

describe('commesseDi', () => {
  it('«Tutti» le abbraccia entrambe', () => {
    expect(commesseDi('tutti')).toEqual(['acea', 'acqualatina']);
    expect(commesseDi('acea')).toEqual(['acea']);
  });
});
