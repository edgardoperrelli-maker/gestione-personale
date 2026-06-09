import { describe, it, expect } from 'vitest';
import {
  normalizzaAscii,
  nomeFotoFile,
  identificativoFoto,
  FOTO_ID_CAMPI,
  FOTO_ID_PRIORITY_DEFAULT,
} from './fotoNaming';

describe('normalizzaAscii', () => {
  it('rimuove accenti e spazi', () => {
    expect(normalizzaAscii('Foto contatore')).toBe('FotoContatore');
    expect(normalizzaAscii('Attività à è ì ò ù')).toBe('AttivitaAEIOU');
  });
  it('rimuove i caratteri speciali', () => {
    expect(normalizzaAscii('Via G. D\'Annunzio, 12/B')).toBe('ViaGDAnnunzio12B');
  });
  it('stringa vuota o solo simboli → stringa vuota', () => {
    expect(normalizzaAscii('  ')).toBe('');
    expect(normalizzaAscii('***')).toBe('');
  });
});

describe('nomeFotoFile', () => {
  it('usa il PDR quando presente (priorità massima)', () => {
    const nome = nomeFotoFile(
      'Foto contatore',
      { pdr: '12345', matricola: 'M99', odl: 'O77', indirizzo: 'Via Roma 1' },
      'jpg',
    );
    expect(nome).toBe('12345_FotoContatore.jpg');
  });

  it('usa la matricola se manca il PDR', () => {
    const nome = nomeFotoFile('Foto sigillo', { matricola: 'MAT-77' }, 'jpg');
    expect(nome).toBe('MAT77_FotoSigillo.jpg');
  });

  it('usa l\'ODL se mancano PDR e matricola', () => {
    const nome = nomeFotoFile('Foto matricola', { odl: 'ODL 9001' }, 'png');
    expect(nome).toBe('ODL9001_FotoMatricola.png');
  });

  it('usa l\'indirizzo se mancano PDR, matricola e ODL', () => {
    const nome = nomeFotoFile('Foto panoramica', { indirizzo: 'Via San Giovanni, 3' }, 'jpg');
    expect(nome).toBe('ViaSanGiovanni3_FotoPanoramica.jpg');
  });

  it('fallback a "intervento" se nessun identificativo', () => {
    const nome = nomeFotoFile('Foto contatore', {}, 'jpg');
    expect(nome).toBe('intervento_FotoContatore.jpg');
  });

  it('normalizza etichette con accenti/spazi e identificativo', () => {
    const nome = nomeFotoFile('Foto attività à', { pdr: 'PDR 0042' }, 'JPEG');
    expect(nome).toBe('PDR0042_FotoAttivitaA.jpeg');
  });

  it('etichetta vuota → "foto" come base', () => {
    const nome = nomeFotoFile('   ', { pdr: '7' }, 'jpg');
    expect(nome).toBe('7_foto.jpg');
  });
});

describe('identificativoFoto', () => {
  it('priorità PDR > matricola > ODL > indirizzo', () => {
    expect(identificativoFoto({ pdr: 'P1', matricola: 'M1', odl: 'O1', indirizzo: 'Via X' })).toBe('P1');
    expect(identificativoFoto({ matricola: 'M1', odl: 'O1', indirizzo: 'Via X' })).toBe('M1');
    expect(identificativoFoto({ odl: 'O1', indirizzo: 'Via X' })).toBe('O1');
    expect(identificativoFoto({ indirizzo: 'Via Roma 3' })).toBe('ViaRoma3');
  });
  it('fallback "intervento" se tutto vuoto', () => {
    expect(identificativoFoto({})).toBe('intervento');
    expect(identificativoFoto({ pdr: '', matricola: null })).toBe('intervento');
  });
});

describe('identificativoFoto con priority', () => {
  it('priority singola usa quel campo ignorando gli altri', () => {
    expect(
      identificativoFoto({ pdr: '12345', matricola: 'M99', odl: 'O77' }, ['odl']),
    ).toBe('O77');
  });

  it('priority a sequenza: salta i vuoti e prende il primo valorizzato', () => {
    expect(
      identificativoFoto({ pdr: '', matricola: '', odl: 'O77', indirizzo: 'Via X' }, ['pdr', 'odl', 'indirizzo']),
    ).toBe('O77');
  });

  it('priority vuota → ordine storico (PDR prima)', () => {
    expect(
      identificativoFoto({ pdr: '12345', matricola: 'M99' }, []),
    ).toBe('12345');
  });

  it('priority indirizzo → indirizzo normalizzato', () => {
    expect(
      identificativoFoto({ matricola: 'M99', indirizzo: 'Via San Giovanni, 3' }, ['indirizzo']),
    ).toBe('ViaSanGiovanni3');
  });

  it('priority valorizzata ma identificativi tutti vuoti → "intervento"', () => {
    expect(identificativoFoto({ pdr: '', odl: '' }, ['pdr', 'odl'])).toBe('intervento');
  });
});

describe('nomeFotoFile con priority', () => {
  it('usa la priority per scegliere l\'identificativo (ODL prima del PDR)', () => {
    const nome = nomeFotoFile(
      'Foto contatore',
      { pdr: '12345', odl: 'ODL 9001' },
      'jpg',
      ['odl', 'pdr'],
    );
    expect(nome).toBe('ODL9001_FotoContatore.jpg');
  });

  it('priority vuota → identico al comportamento storico', () => {
    const nome = nomeFotoFile('Foto contatore', { pdr: '12345' }, 'jpg', []);
    expect(nome).toBe('12345_FotoContatore.jpg');
  });
});

describe('costanti foto id', () => {
  it('FOTO_ID_PRIORITY_DEFAULT è l\'ordine storico', () => {
    expect(FOTO_ID_PRIORITY_DEFAULT).toEqual(['pdr', 'matricola', 'odl', 'indirizzo']);
  });

  it('FOTO_ID_CAMPI elenca i 4 identificativi con etichetta', () => {
    expect(FOTO_ID_CAMPI.map((c) => c.chiave)).toEqual(['pdr', 'matricola', 'odl', 'indirizzo']);
  });
});
