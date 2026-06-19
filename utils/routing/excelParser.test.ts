import { describe, it, expect } from 'vitest';
import { detectFormat, resolveOdl } from './excelParser';

const HEADER = [
  'CO', 'MATRICOLA', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE',
  'Tipo OdL(CdL)/Servizio', 'Fascia Appuntamento/Blocco', 'PdR / Impianto', 'Nominativo',
];

describe('detectFormat — Export Dati', () => {
  it('mappa la colonna MATRICOLA', () => {
    const cols = detectFormat(HEADER);
    expect(cols).not.toBeNull();
    expect(cols!.matricola).toBe(1);
    expect(cols!.via).toBe(4); // Indirizzo
    expect(cols!.nominativo).toBe(10);
  });

  it('senza MATRICOLA → matricola null (parsing intatto)', () => {
    const cols = detectFormat([
      'CO', 'Id', 'ODSIN', 'Indirizzo', 'CAP', 'COMUNE', 'PdR / Impianto', 'Nominativo',
    ]);
    expect(cols!.matricola).toBeNull();
    expect(cols!.via).toBe(3);
  });
});

describe('detectFormat · durata', () => {
  it('mappa la colonna "Tempo Esecuzione" nel formato Export Dati', () => {
    const header = ['Indirizzo', 'CAP', 'Comune', 'Fascia', 'Tempo Esecuzione'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.durata).toBe(4);
  });

  it('durata = null se la colonna non esiste', () => {
    const header = ['Indirizzo', 'CAP', 'Comune'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.durata).toBeNull();
  });
});

describe('resolveOdl — identificativo ODS/ODL unico', () => {
  it('preferisce la colonna ODL grezza', () => {
    expect(resolveOdl('ODL123', '20043151148', 'PDR9')).toBe('ODL123');
  });
  it('senza ODL usa la colonna ODS/ODSIN (numero pulito)', () => {
    expect(resolveOdl('', '20043151148', '')).toBe('20043151148');
  });
  it('estrae il 200xxxxxxxx quando il campo ODS ha testo extra', () => {
    expect(resolveOdl('', 'ABC 20012345678 XY', '')).toBe('20012345678');
  });
  it('estrae un vero ODS 200xxxxxxxx dal PDR se presente', () => {
    expect(resolveOdl('', '', 'xx 20012345678 yy')).toBe('20012345678');
  });
  it('NON usa il PDR grezzo come ODL (PDR 14 cifre / matricola → vuoto)', () => {
    expect(resolveOdl('', '', '00594203345063')).toBe('');
    expect(resolveOdl('', '', 'IGMB030260006820')).toBe('');
  });
  it('tutto vuoto → stringa vuota', () => {
    expect(resolveOdl('', '', '')).toBe('');
  });
});

describe('detectFormat — header "ODS"', () => {
  it('riconosce una colonna intitolata "ODS" come odl', () => {
    const cm = detectFormat(['ODS', 'Indirizzo', 'CAP', 'Comune']);
    expect(cm).not.toBeNull();
    expect(cm!.odl).toBe(0);
    expect(cm!.via).toBe(1);
  });
});

describe('detectFormat — colonne coordinate', () => {
  it('rileva Lat/Long dall\'intestazione (formato leggibile)', () => {
    const header = ['Indirizzo', 'CAP', 'Comune', 'Long', 'Lat'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.lat).toBe(4);
    expect(cm!.lng).toBe(3);
  });
  it('senza colonne coordinate → lat/lng null', () => {
    const header = ['Indirizzo', 'CAP', 'Comune'];
    const cm = detectFormat(header);
    expect(cm).not.toBeNull();
    expect(cm!.lat).toBeNull();
    expect(cm!.lng).toBeNull();
  });
});

describe('detectFormat — colonna Note', () => {
  it('mappa una colonna "Note" (formato leggibile)', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune', 'Note']);
    expect(cm).not.toBeNull();
    expect(cm!.note).toBe(3);
  });
  it('riconosce anche "Nota" e "Annotazioni"', () => {
    expect(detectFormat(['Indirizzo', 'Nota'])!.note).toBe(1);
    expect(detectFormat(['Indirizzo', 'Annotazioni'])!.note).toBe(1);
  });
  it('senza colonna note → note null', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune']);
    expect(cm!.note).toBeNull();
  });
  it('riconosce l\'header del template "Note per operatore"', () => {
    const cm = detectFormat(['Indirizzo', 'CAP', 'Comune', 'Note per operatore']);
    expect(cm).not.toBeNull();
    expect(cm!.note).toBe(3);
  });
});
