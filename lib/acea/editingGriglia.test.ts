import { describe, it, expect } from 'vitest';
import {
  normalizzaIntervallo, celleDi, spostaFocus, parseBloccoIncollato, calcolaIncolla,
  validaData, validaOperatore, daSaltare, eventoDiUnCampo,
} from './editingGriglia';

describe('intervalli', () => {
  it('normalizza qualunque verso di selezione', () => {
    // Selezionare dal basso a destra verso l'alto a sinistra deve dare lo stesso intervallo.
    const atteso = { da: { riga: 1, colonna: 0 }, a: { riga: 3, colonna: 1 } };
    expect(normalizzaIntervallo({ da: { riga: 3, colonna: 1 }, a: { riga: 1, colonna: 0 } })).toEqual(atteso);
    expect(normalizzaIntervallo({ da: { riga: 1, colonna: 0 }, a: { riga: 3, colonna: 1 } })).toEqual(atteso);
  });

  it('elenca le celle in ordine di lettura', () => {
    expect(celleDi({ da: { riga: 0, colonna: 0 }, a: { riga: 1, colonna: 1 } })).toEqual([
      { riga: 0, colonna: 0 }, { riga: 0, colonna: 1 },
      { riga: 1, colonna: 0 }, { riga: 1, colonna: 1 },
    ]);
  });
});

describe('spostaFocus', () => {
  const l = { righe: 3, colonne: 2 };
  it('si muove nelle quattro direzioni', () => {
    expect(spostaFocus({ riga: 1, colonna: 0 }, 'giu', l)).toEqual({ riga: 2, colonna: 0 });
    expect(spostaFocus({ riga: 1, colonna: 0 }, 'su', l)).toEqual({ riga: 0, colonna: 0 });
    expect(spostaFocus({ riga: 1, colonna: 0 }, 'destra', l)).toEqual({ riga: 1, colonna: 1 });
    expect(spostaFocus({ riga: 1, colonna: 1 }, 'sinistra', l)).toEqual({ riga: 1, colonna: 0 });
  });

  it('il bordo ferma, non avvolge', () => {
    expect(spostaFocus({ riga: 0, colonna: 0 }, 'su', l)).toEqual({ riga: 0, colonna: 0 });
    expect(spostaFocus({ riga: 2, colonna: 1 }, 'giu', l)).toEqual({ riga: 2, colonna: 1 });
    expect(spostaFocus({ riga: 0, colonna: 1 }, 'destra', l)).toEqual({ riga: 0, colonna: 1 });
  });

  it('regge una griglia vuota senza indici negativi', () => {
    expect(spostaFocus({ riga: 0, colonna: 0 }, 'giu', { righe: 0, colonne: 0 }))
      .toEqual({ riga: 0, colonna: 0 });
  });
});

describe('parseBloccoIncollato', () => {
  it('legge il formato di Excel: TAB fra colonne, CRLF fra righe', () => {
    expect(parseBloccoIncludeCRLF()).toEqual([['ROSSI', '27/07/2026'], ['BIANCHI', '28/07/2026']]);
    function parseBloccoIncludeCRLF() {
      return parseBloccoIncollato('ROSSI\t27/07/2026\r\nBIANCHI\t28/07/2026\r\n');
    }
  });

  it('regge il solo a capo (incolla da editor di testo)', () => {
    expect(parseBloccoIncollato('ROSSI\nBIANCHI')).toEqual([['ROSSI'], ['BIANCHI']]);
  });

  it('una cella sola resta una matrice 1x1', () => {
    expect(parseBloccoIncollato('ROSSI')).toEqual([['ROSSI']]);
  });

  it('gestisce le celle quotate con a capo e virgolette interne', () => {
    expect(parseBloccoIncollato('"DE ROSSI"\tX')).toEqual([['DE ROSSI', 'X']]);
    expect(parseBloccoIncollato('"a\nb"\tc')).toEqual([['a\nb', 'c']]);
    expect(parseBloccoIncollato('"dice ""ok"""')).toEqual([['dice "ok"']]);
  });

  it('scarta l\'a-capo finale ma conserva le celle vuote interne', () => {
    expect(parseBloccoIncollato('A\t\r\nB\tC\r\n')).toEqual([['A', ''], ['B', 'C']]);
  });

  it('stringa vuota → nessuna riga', () => {
    expect(parseBloccoIncollato('')).toEqual([]);
  });
});

describe('calcolaIncolla', () => {
  const limiti = { righe: 5, colonne: 2 };

  it('una cella su un intervallo riempie tutto l\'intervallo', () => {
    // È il gesto con cui si assegna lo stesso operatore a venti righe.
    const e = calcolaIncolla(
      [['ROSSI']],
      { da: { riga: 1, colonna: 0 }, a: { riga: 3, colonna: 0 } },
      limiti,
    );
    expect(e.scritture).toEqual([
      { riga: 1, colonna: 0, valore: 'ROSSI' },
      { riga: 2, colonna: 0, valore: 'ROSSI' },
      { riga: 3, colonna: 0, valore: 'ROSSI' },
    ]);
  });

  it('un blocco si scrive dall\'angolo alto-sinistra della selezione', () => {
    const e = calcolaIncolla(
      [['ROSSI', '2026-07-27'], ['BIANCHI', '2026-07-28']],
      { da: { riga: 0, colonna: 0 }, a: { riga: 0, colonna: 0 } },
      limiti,
    );
    expect(e.scritture).toHaveLength(4);
    expect(e.scritture[0]).toEqual({ riga: 0, colonna: 0, valore: 'ROSSI' });
    expect(e.scritture[3]).toEqual({ riga: 1, colonna: 1, valore: '2026-07-28' });
  });

  it('tronca ciò che eccede i bordi e lo riporta, senza scriverlo altrove', () => {
    const e = calcolaIncolla(
      [['a', 'b'], ['c', 'd'], ['e', 'f']],
      { da: { riga: 4, colonna: 0 }, a: { riga: 4, colonna: 0 } },
      limiti,
    );
    expect(e.scritture).toHaveLength(2);      // solo la riga 4
    expect(e.righeIgnorate).toBe(2);
  });

  it('tronca anche in orizzontale', () => {
    const e = calcolaIncolla(
      [['a', 'b', 'c']],
      { da: { riga: 0, colonna: 1 }, a: { riga: 0, colonna: 1 } },
      limiti,
    );
    expect(e.scritture).toEqual([{ riga: 0, colonna: 1, valore: 'a' }]);
    expect(e.colonneIgnorate).toBe(2);
  });

  it('griglia vuota: nessuna scrittura, nessuna eccezione', () => {
    const e = calcolaIncolla([['x']], { da: { riga: 0, colonna: 0 }, a: { riga: 0, colonna: 0 } },
      { righe: 0, colonne: 0 });
    expect(e.scritture).toEqual([]);
  });
});

describe('validaData', () => {
  it('accetta ISO e formato italiano, normalizzando a ISO', () => {
    expect(validaData('2026-07-27')).toEqual({ ok: true, valore: '2026-07-27' });
    expect(validaData('27/07/2026')).toEqual({ ok: true, valore: '2026-07-27' });
    expect(validaData('7/7/2026')).toEqual({ ok: true, valore: '2026-07-07' });
    expect(validaData('27-07-2026')).toEqual({ ok: true, valore: '2026-07-27' });
  });

  it('rifiuta le date inesistenti', () => {
    expect(validaData('31/02/2026').ok).toBe(false);
    expect(validaData('2026-13-01').ok).toBe(false);
    expect(validaData('domani').ok).toBe(false);
  });

  it('una cella vuota non cancella la pianificazione: si salta', () => {
    // Un incolla con celle vuote svuoterebbe il lavoro senza che nessuno l'abbia chiesto.
    expect(daSaltare(validaData(''))).toBe(true);
    expect(daSaltare(validaData('   '))).toBe(true);
  });
});

// La finestra programmabile non può valere solo per il menu della barra azioni: basterebbe un
// incolla da Excel per aggirarla, cioè proprio il gesto che la griglia esiste per rendere comodo.
describe('validaData — finestra programmabile', () => {
  const giorni = [
    { data: '2026-07-31', esteso: 'venerdì 31/07' },
    { data: '2026-08-03', esteso: 'lunedì 03/08' },
  ];

  it('accetta i giorni della finestra, in ISO e all’italiana', () => {
    expect(validaData('2026-07-31', giorni)).toEqual({ ok: true, valore: '2026-07-31' });
    expect(validaData('03/08/2026', giorni)).toEqual({ ok: true, valore: '2026-08-03' });
  });

  it('rifiuta una data fuori finestra dicendo quali sono i giorni buoni', () => {
    const e = validaData('01/08/2026', giorni);   // il sabato in mezzo
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toBe('01/08/2026: si programma solo per venerdì 31/07 o lunedì 03/08');
  });

  it('senza finestra si comporta come prima: qualunque data valida passa', () => {
    expect(validaData('2026-09-15')).toEqual({ ok: true, valore: '2026-09-15' });
    expect(validaData('2026-09-15', [])).toEqual({ ok: true, valore: '2026-09-15' });
  });

  it('la cella vuota resta un salto anche con la finestra attiva', () => {
    expect(daSaltare(validaData('', giorni))).toBe(true);
  });
});

describe('validaOperatore', () => {
  const operatori = [
    { id: 's1', display_name: 'DE ROSSI ANNA' },
    { id: 's2', display_name: 'BIANCHI LUIGI' },
    { id: 's3', display_name: 'BIANCHI MARCO' },
  ];

  it('trova per nome completo, senza badare a maiuscole e spazi', () => {
    expect(validaOperatore('DE ROSSI ANNA', operatori)).toEqual({ ok: true, valore: 's1' });
    expect(validaOperatore('de rossi anna', operatori)).toEqual({ ok: true, valore: 's1' });
    expect(validaOperatore('  DE   ROSSI ANNA ', operatori)).toEqual({ ok: true, valore: 's1' });
  });

  it('accetta un prefisso se identifica una persona sola', () => {
    expect(validaOperatore('DE ROSSI', operatori)).toEqual({ ok: true, valore: 's1' });
  });

  it('si ferma se il nome è ambiguo invece di tirare a indovinare', () => {
    // Assegnare il lavoro alla persona sbagliata è peggio che chiedere di essere più precisi.
    const e = validaOperatore('BIANCHI', operatori);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toMatch(/ambiguo/i);
  });

  it('segnala un operatore inesistente', () => {
    const e = validaOperatore('VERDI', operatori);
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.motivo).toMatch(/non trovato/i);
  });

  it('cella vuota: si salta', () => {
    expect(daSaltare(validaOperatore('', operatori))).toBe(true);
  });
});

// Il vincolo «dev'essere in cronoprogramma quel giorno» NON sta qui, ed è una decisione: dipende
// dalla data su cui la riga andrà a finire, che in griglia non si conosce. Imporlo qui avrebbe
// impedito di riassegnare un intervento vecchio e non eseguito senza spostarlo di data.
describe('validaOperatore — non è la griglia a conoscere il cronoprogramma', () => {
  const attivi = [
    { id: 's1', display_name: 'DE ROSSI ANNA' },
    { id: 's2', display_name: 'BIANCHI LUIGI' },
  ];

  it('accetta qualunque operatore attivo: il giorno lo controlla il server', () => {
    expect(validaOperatore('BIANCHI LUIGI', attivi)).toEqual({ ok: true, valore: 's2' });
  });
});

// La griglia ascolta keydown/copy/paste su `window` perché le celle non sono focalizzabili. Il
// filtro sul bersaglio è ciò che le impedisce di rubare i tasti a ogni campo della pagina — e con i
// filtri nelle intestazioni (pannelli in portale, con dentro delle input) è diventato indispensabile.
describe('eventoDiUnCampo', () => {
  /** Finto bersaglio: `closest` risponde se il selettore contiene uno dei ruoli dichiarati. */
  const bersaglio = (ruoli: string[], contentEditable = false) => ({
    isContentEditable: contentEditable,
    closest: (sel: string) => (ruoli.some((r) => sel.includes(r)) ? {} : null),
  });

  it('lascia passare gli eventi nati fuori dai campi', () => {
    expect(eventoDiUnCampo(bersaglio([]))).toBe(false);
  });

  it('ferma gli eventi di input, textarea e select', () => {
    expect(eventoDiUnCampo(bersaglio(['input']))).toBe(true);
    expect(eventoDiUnCampo(bersaglio(['textarea']))).toBe(true);
    expect(eventoDiUnCampo(bersaglio(['select']))).toBe(true);
  });

  // Il pannello di un filtro di colonna è in portale: fuori dall'albero della tabella, dentro window.
  it('ferma gli eventi nati dentro un dialogo', () => {
    expect(eventoDiUnCampo(bersaglio(['[role="dialog"]']))).toBe(true);
  });

  it('ferma gli eventi di un elemento contenteditable', () => {
    expect(eventoDiUnCampo(bersaglio([], true))).toBe(true);
  });

  it('non esplode su bersagli assenti o senza closest', () => {
    expect(eventoDiUnCampo(null)).toBe(false);
    expect(eventoDiUnCampo({})).toBe(false);
    expect(eventoDiUnCampo({ isContentEditable: false })).toBe(false);
  });
});

describe('validaOperatore — elenco non caricato', () => {
  /*
    Il caso che ha fatto perdere tempo: l'endpoint degli operatori non aveva un GET, il client
    riceveva 405, controllava `res.ok` e lasciava l'elenco vuoto senza dire niente. Ogni nome
    incollato tornava «operatore non trovato» — compreso quello copiato dalla cella accanto, che
    e` proprio il gesto che fa sospettare tutt'altro (nome e cognome invertiti, maiuscole...).

    Con l'elenco vuoto il messaggio deve dire che manca l'ELENCO, non che manca il nome.
  */
  it('dice che manca l’elenco, non che manca il nome', () => {
    const e = validaOperatore('LIBERATORI ADRIANO', []);
    expect(e.ok).toBe(false);
    if (!e.ok) {
      expect(e.motivo).toMatch(/elenco/i);
      expect(e.motivo).not.toMatch(/non trovato/i);
    }
  });

  it('una cella vuota resta saltata anche senza elenco', () => {
    // Svuotare una cella non ha bisogno dell'anagrafica: e` una cancellazione.
    expect(daSaltare(validaOperatore('', []))).toBe(true);
  });

  it('con l’elenco carico il nome esatto passa', () => {
    const op = [{ id: 'x', display_name: 'LIBERATORI ADRIANO' }];
    const e = validaOperatore('LIBERATORI ADRIANO', op);
    expect(e).toEqual({ ok: true, valore: 'x' });
    // E il giro chiuso: quello che la tabella MOSTRA si deve poter reincollare.
    expect(validaOperatore('  liberatori   adriano ', op)).toEqual({ ok: true, valore: 'x' });
  });
});
