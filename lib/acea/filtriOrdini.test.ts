import { describe, it, expect } from 'vitest';
import {
  COLONNE_ELENCO, COLONNE_TESTO, colonneFiltrate, contaFiltriColonna, espressioneRicerca,
  filtriPianificazioneAttivi, filtriVuoti, haFiltriAttivi, intervalloPagina, leggiFiltri,
  ordinabile, ORDINAMENTI, parametriQuery, serveIncrocio, soglieScadenza,
  terminoContiene,
} from './filtriOrdini';

const q = (s: string) => leggiFiltri(new URLSearchParams(s));

const ELENCHI_VUOTI = {
  comune: [], attivita: [], stato_desc: [], operatore_cognome: [], cap: [], microarea: [],
};
const TESTI_VUOTI = { odl: null, matricola_norm: null, impianto: null, via: null };

describe('leggiFiltri', () => {
  it('senza parametri applica i default', () => {
    expect(q('')).toEqual({
      famiglia: null, stato: 'tutti', elenchi: ELENCHI_VUOTI, testi: TESTI_VUOTI,
      scadenza: 'tutte', entroGiorni: 7, cerca: null, pagina: 1, perPagina: 100,
      pianificazione: {
        esecutori: [], senzaEsecutore: false, pianificazione: 'tutte', giorno: null,
      },
      // `null` e non una colonna qualsiasi: senza ordinamento chiesto vale quello canonico
      // (scadenza, poi creazione), che e` l'ordine in cui si lavora la giornata.
      ordina: null, verso: 'asc',
    });
  });

  it('legge i valori validi', () => {
    const f = q('famiglia=massive&stato=aperti&comune=ZAGAROLO&scadenza=scaduti&pagina=3&perPagina=50');
    expect(f).toMatchObject({
      famiglia: 'massive', stato: 'aperti', scadenza: 'scaduti', pagina: 3, perPagina: 50,
    });
    expect(f.elenchi.comune).toEqual(['ZAGAROLO']);
  });

  it('un valore ignoto cade sul default invece di dare errore', () => {
    expect(q('famiglia=pippo').famiglia).toBeNull();
    expect(q('stato=boh').stato).toBe('tutti');
    expect(q('scadenza=domani').scadenza).toBe('tutte');
  });

  it('limita la paginazione entro valori sensati', () => {
    expect(q('perPagina=99999').perPagina).toBe(500);   // tetto
    expect(q('perPagina=0').perPagina).toBe(1);
    expect(q('perPagina=abc').perPagina).toBe(100);      // default
    expect(q('pagina=0').pagina).toBe(1);
    expect(q('entroGiorni=999').entroGiorni).toBe(60);
  });

  it('normalizza le stringhe vuote a null', () => {
    expect(q('cerca=').cerca).toBeNull();
    expect(q('comune=%20%20').elenchi.comune).toEqual([]);
  });
});

// Il cuore del filtro «come Excel»: più valori spuntati sulla stessa colonna.
describe('leggiFiltri — colonne a elenco', () => {
  it('più valori sulla stessa colonna diventano un elenco', () => {
    expect(q('comune=ROMA&comune=ZAGAROLO&comune=TIVOLI').elenchi.comune)
      .toEqual(['ROMA', 'ZAGAROLO', 'TIVOLI']);
  });

  it('un solo valore resta un elenco di uno (compatibile con i link vecchi)', () => {
    expect(q('comune=ROMA').elenchi.comune).toEqual(['ROMA']);
  });

  it('scarta i doppioni e i valori vuoti senza perdere gli altri', () => {
    expect(q('comune=ROMA&comune=&comune=ROMA&comune=%20&comune=TIVOLI').elenchi.comune)
      .toEqual(['ROMA', 'TIVOLI']);
  });

  it('colonne diverse restano indipendenti', () => {
    const f = q('comune=ROMA&attivita=DUNNING&operatore_cognome=ROSSI&stato_desc=Iniziato&cap=00139&microarea=12');
    expect(f.elenchi).toEqual({
      comune: ['ROMA'], attivita: ['DUNNING'],
      operatore_cognome: ['ROSSI'], stato_desc: ['Iniziato'], cap: ['00139'],
      // Il gruppo e` un intero in banca dati ma viaggia come stringa nella URL, come ogni altra
      // spunta: e` Postgres a convertirlo, e `in('microarea', ['12'])` resta un `in` di uno.
      microarea: ['12'],
    });
  });

  it('tetto ai valori per non produrre URL impraticabili', () => {
    const tanti = Array.from({ length: 500 }, (_, i) => `comune=C${i}`).join('&');
    expect(q(tanti).elenchi.comune).toHaveLength(200);
  });

  it('ogni colonna dichiarata ha una chiave, anche senza parametri', () => {
    const f = q('');
    for (const c of COLONNE_ELENCO) expect(f.elenchi[c]).toEqual([]);
  });
});

describe('leggiFiltri — colonne a testo', () => {
  it('legge il termine «contiene» per colonna', () => {
    const f = q('odl=9122&via=GARIBALDI');
    expect(f.testi.odl).toBe('9122');
    expect(f.testi.via).toBe('GARIBALDI');
    expect(f.testi.impianto).toBeNull();
  });

  it('ogni colonna dichiarata ha una chiave, anche senza parametri', () => {
    const f = q('');
    for (const c of COLONNE_TESTO) expect(f.testi[c]).toBeNull();
  });
});

describe('terminoContiene', () => {
  // `*` e `%` sono i jolly di ilike: se passassero, chi cerca «50%» otterrebbe «qualsiasi cosa»
  // invece delle righe che contengono quel testo.
  it('neutralizza i jolly di ilike', () => {
    expect(terminoContiene('50%')).toBe('50');
    expect(terminoContiene('*')).toBeNull();
    expect(terminoContiene('a*b')).toBe('a b');
    expect(terminoContiene('%%%')).toBeNull();
  });

  it('null su vuoto e spazi', () => {
    expect(terminoContiene('')).toBeNull();
    expect(terminoContiene('   ')).toBeNull();
    expect(terminoContiene(null)).toBeNull();
    expect(terminoContiene(undefined)).toBeNull();
  });

  it('lascia intatto un termine normale', () => {
    expect(terminoContiene('  VIA ROMA 12 ')).toBe('VIA ROMA 12');
  });
});

describe('colonneFiltrate', () => {
  it('zero quando non filtra nulla', () => {
    expect(colonneFiltrate(q(''))).toBe(0);
    // Stato e ricerca libera NON sono filtri di colonna: stanno nella barra sopra la tabella.
    expect(colonneFiltrate(q('stato=aperti&cerca=912'))).toBe(0);
  });

  it('conta una volta sola la colonna con più valori spuntati', () => {
    expect(colonneFiltrate(q('comune=ROMA&comune=TIVOLI'))).toBe(1);
  });

  it('somma elenchi, testi e scadenza', () => {
    expect(colonneFiltrate(q('comune=ROMA&odl=91&scadenza=scaduti'))).toBe(3);
  });
});

describe('soglieScadenza', () => {
  it('scaduti = strettamente prima di oggi', () => {
    // Un ordine che scade OGGI non è ancora in ritardo: contarlo come scaduto farebbe
    // perdere fiducia nel numero.
    expect(soglieScadenza(q('scadenza=scaduti'), '2026-07-26'))
      .toEqual({ tipo: 'scaduti', prima: '2026-07-26' });
  });

  it('in scadenza = da oggi a oggi+N inclusi', () => {
    expect(soglieScadenza(q('scadenza=in_scadenza'), '2026-07-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-07-26', a: '2026-08-02' });
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=1'), '2026-07-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-07-26', a: '2026-07-27' });
  });

  it('attraversa mesi e anni senza slittare di fuso', () => {
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=10'), '2026-12-26'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-12-26', a: '2027-01-05' });
    // passaggio all'ora legale: senza aritmetica UTC salterebbe un giorno
    expect(soglieScadenza(q('scadenza=in_scadenza&entroGiorni=2'), '2026-03-28'))
      .toEqual({ tipo: 'in_scadenza', da: '2026-03-28', a: '2026-03-30' });
  });

  it('senza scadenza è un filtro a sé (le massive)', () => {
    expect(soglieScadenza(q('scadenza=senza_scadenza'), '2026-07-26')).toEqual({ tipo: 'senza_scadenza' });
  });

  it('nessun filtro scadenza → nessuna soglia', () => {
    expect(soglieScadenza(q(''), '2026-07-26')).toEqual({ tipo: 'nessuna' });
  });

  it('una data odierna malformata non produce soglie sballate', () => {
    expect(soglieScadenza(q('scadenza=scaduti'), '26/07/2026')).toEqual({ tipo: 'nessuna' });
  });
});

describe('intervalloPagina', () => {
  it('la prima pagina parte da zero', () => {
    expect(intervalloPagina(q('perPagina=100'))).toEqual({ da: 0, a: 99 });
  });
  it('le pagine successive non si sovrappongono', () => {
    expect(intervalloPagina(q('pagina=2&perPagina=100'))).toEqual({ da: 100, a: 199 });
    expect(intervalloPagina(q('pagina=3&perPagina=50'))).toEqual({ da: 100, a: 149 });
  });
});

// Il giro completo: quello che l'utente spunta nell'intestazione deve arrivare al server ESATTAMENTE
// come il server lo rilegge. Questi test chiudono l'anello parametriQuery → leggiFiltri.
describe('parametriQuery', () => {
  it('senza filtri manda solo famiglia, paginazione e lo stato di default', () => {
    const p = parametriQuery(filtriVuoti(), 'dunning', 300);
    expect(p.toString()).toBe('famiglia=dunning&perPagina=300&stato=aperti');
  });

  it('le spunte multiple diventano parametri ripetuti', () => {
    const f = filtriVuoti();
    f.elenchi.comune = ['ROMA', 'TIVOLI'];
    expect(parametriQuery(f, 'dunning', 300).getAll('comune')).toEqual(['ROMA', 'TIVOLI']);
  });

  it('il server rilegge esattamente ciò che il client ha spedito', () => {
    const f = filtriVuoti();
    f.elenchi.comune = ['ROMA', 'TIVOLI'];
    f.elenchi.attivita = ['Limitazione Massiva su Impianto'];
    f.testi.via = 'GARIBALDI';
    f.scadenza = 'scaduti';
    f.cerca = '912215';

    const riletti = leggiFiltri(parametriQuery(f, 'massive', 300));
    expect(riletti.elenchi.comune).toEqual(['ROMA', 'TIVOLI']);
    expect(riletti.elenchi.attivita).toEqual(['Limitazione Massiva su Impianto']);
    expect(riletti.testi.via).toBe('GARIBALDI');
    expect(riletti.scadenza).toBe('scaduti');
    expect(riletti.cerca).toBe('912215');
    expect(riletti.stato).toBe('aperti');
    expect(riletti.famiglia).toBe('massive');
  });

  it('sopravvive ai valori con caratteri speciali', () => {
    const f = filtriVuoti();
    // Un'attività con la & e un comune con l'apostrofo: se l'URL non è codificata, si perdono.
    f.elenchi.attivita = ['A & B'];
    f.elenchi.comune = ["SANT'ANGELO"];
    const riletti = leggiFiltri(parametriQuery(f, 'dunning', 300));
    expect(riletti.elenchi.attivita).toEqual(['A & B']);
    expect(riletti.elenchi.comune).toEqual(["SANT'ANGELO"]);
  });

  it('i valori vuoti non finiscono nella URL', () => {
    const f = filtriVuoti();
    f.testi.odl = '   ';
    f.cerca = '  ';
    const p = parametriQuery(f, 'dunning', 300);
    expect(p.has('odl')).toBe(false);
    expect(p.has('cerca')).toBe(false);
  });

  it('«tutti gli stati» toglie il parametro invece di mandarne uno finto', () => {
    const f = filtriVuoti();
    f.stato = 'tutti';
    expect(parametriQuery(f, 'dunning', 300).has('stato')).toBe(false);
    expect(leggiFiltri(parametriQuery(f, 'dunning', 300)).stato).toBe('tutti');
  });
});

describe('filtriVuoti', () => {
  // Una costante condivisa con oggetti annidati verrebbe mutata da chi la usa come base.
  it('restituisce ogni volta oggetti nuovi', () => {
    const a = filtriVuoti();
    a.elenchi.comune.push('ROMA');
    expect(filtriVuoti().elenchi.comune).toEqual([]);
  });
});

describe('contaFiltriColonna e haFiltriAttivi', () => {
  it('lo stato iniziale non conta come filtro attivo', () => {
    expect(haFiltriAttivi(filtriVuoti())).toBe(false);
    expect(contaFiltriColonna(filtriVuoti())).toBe(0);
  });

  it('una colonna con più spunte conta una volta sola', () => {
    const f = filtriVuoti();
    f.elenchi.comune = ['ROMA', 'TIVOLI', 'ZAGAROLO'];
    expect(contaFiltriColonna(f)).toBe(1);
  });

  it('la ricerca libera e lo stato attivano «azzera» ma non sono filtri di colonna', () => {
    const conCerca = { ...filtriVuoti(), cerca: '912' };
    expect(contaFiltriColonna(conCerca)).toBe(0);
    expect(haFiltriAttivi(conCerca)).toBe(true);

    const conStato = { ...filtriVuoti(), stato: 'tutti' as const };
    expect(contaFiltriColonna(conStato)).toBe(0);
    expect(haFiltriAttivi(conStato)).toBe(true);
  });

  it('un testo di soli spazi non conta come filtro', () => {
    const f = filtriVuoti();
    f.testi.odl = '   ';
    expect(contaFiltriColonna(f)).toBe(0);
    expect(haFiltriAttivi(f)).toBe(false);
  });
});

describe('espressioneRicerca', () => {
  it('cerca su ODL, matricola, impianto, indirizzo e testo ordine', () => {
    expect(espressioneRicerca(q('cerca=912215'))).toBe(
      'odl.ilike.*912215*,matricola_norm.ilike.*912215*,impianto.ilike.*912215*,via.ilike.*912215*,testo_ordine.ilike.*912215*',
    );
  });

  it('neutralizza i caratteri che spezzerebbero la sintassi di PostgREST', () => {
    // Virgole e parentesi nel termine cercato chiuderebbero l'espressione `or=(...)` e
    // cambierebbero la query: vengono sostituite con spazi prima di comporre il filtro.
    const e = espressioneRicerca(q('cerca=' + encodeURIComponent('a,b)c(*')));
    expect(e).toBe(
      'odl.ilike.*a b c*,matricola_norm.ilike.*a b c*,impianto.ilike.*a b c*,via.ilike.*a b c*,testo_ordine.ilike.*a b c*',
    );
    // il termine ripulito non contiene più caratteri di sintassi
    const termine = /odl\.ilike\.\*(.*?)\*,/.exec(e ?? '')?.[1] ?? '';
    expect(termine).not.toMatch(/[(),*]/);
  });

  it('null quando non c\'è nulla da cercare', () => {
    expect(espressioneRicerca(q(''))).toBeNull();
    expect(espressioneRicerca(q('cerca=' + encodeURIComponent('(),')))).toBeNull();
  });
});

// I due filtri che non vivono nel registro: esecutore e giorno pianificato stanno in `interventi`,
// e sono l'interruttore che decide se la route fa una query sola o l'incrocio. Sbagliare
// `filtriPianificazioneAttivi` costa in un verso una tabella lenta senza motivo, nell'altro un
// filtro che l'utente imposta e che non viene applicato — e il conteggio non lo denuncerebbe.
describe('filtri di pianificazione', () => {
  const p = (s: string) => leggiFiltri(new URLSearchParams(s)).pianificazione;

  it('senza criteri non è attivo', () => {
    expect(filtriPianificazioneAttivi(p(''))).toBe(false);
    expect(filtriPianificazioneAttivi(p('comune=ROMA&cerca=via'))).toBe(false);
  });

  it.each([
    ['un esecutore', 'esecutore=ROSSI MARIO'],
    ['non assegnato', 'senzaEsecutore=1'],
    ['non pianificati', 'pianificazione=non_pianificati'],
    ['già pianificati', 'pianificazione=pianificati'],
    ['un giorno', 'giornoPianificato=2026-07-28'],
  ])('con %s è attivo', (_caso, qs) => {
    expect(filtriPianificazioneAttivi(p(qs))).toBe(true);
  });

  it('legge più esecutori come spunte multiple', () => {
    expect(p('esecutore=ROSSI&esecutore=BIANCHI').esecutori).toEqual(['ROSSI', 'BIANCHI']);
  });

  it('un giorno malformato non è un filtro', () => {
    // Cadere su `null` e non su una data storta: una data che Postgres rifiuta farebbe fallire la
    // query, e una che accetta ma non è quella voluta svuoterebbe la tabella senza spiegazioni.
    expect(p('giornoPianificato=28/07/2026').giorno).toBeNull();
    expect(p('giornoPianificato=domani').giorno).toBeNull();
    expect(p('giornoPianificato=2026-07-28').giorno).toBe('2026-07-28');
  });

  it('un valore ignoto di `pianificazione` cade sul default', () => {
    expect(p('pianificazione=boh').pianificazione).toBe('tutte');
  });

  it('la query rifà i parametri che ha letto', () => {
    const f = filtriVuoti();
    f.pianificazione = {
      esecutori: ['ROSSI', 'BIANCHI'], senzaEsecutore: true,
      pianificazione: 'pianificati', giorno: '2026-07-28',
    };
    const qs = parametriQuery(f, 'dunning', 300);
    expect(qs.getAll('esecutore')).toEqual(['ROSSI', 'BIANCHI']);
    expect(qs.get('senzaEsecutore')).toBe('1');
    expect(qs.get('pianificazione')).toBe('pianificati');
    expect(qs.get('giornoPianificato')).toBe('2026-07-28');
  });

  it('le due colonne contano un filtro ciascuna, non uno per criterio', () => {
    const f = filtriVuoti();
    f.pianificazione = {
      esecutori: ['ROSSI'], senzaEsecutore: true,
      pianificazione: 'pianificati', giorno: '2026-07-28',
    };
    // Esecutore (spunte + «non assegnato») è UN imbuto; Data pianificata (stato + giorno) è l'altro.
    expect(contaFiltriColonna(f)).toBe(2);
  });
});

/*
  L'INVARIANTE che tiene onesta la tabella: ogni filtro di colonna deve diventare un parametro
  della query, cioe` deve essere applicato da Postgres sull'intero registro.

  A schermo ci sono 300 righe di 5.000+. Un filtro applicato al caricato mostrerebbe un
  sottoinsieme di un sottoinsieme, con un conteggio che non corrisponde a niente: «12 di 871»
  quando i risultati veri sono 400. E` il difetto piu` facile da introdurre senza accorgersene —
  basta una riga di `.filter()` nel componente — e il piu` difficile da vedere guardando lo
  schermo, perche` una tabella filtrata male sembra una tabella filtrata bene.
*/
describe('ogni filtro di colonna arriva al server', () => {
  it('le colonne a elenco emettono il loro parametro', () => {
    for (const c of COLONNE_ELENCO) {
      const f = filtriVuoti();
      f.elenchi[c] = ['X'];
      expect(parametriQuery(f, 'dunning', 300).getAll(c)).toEqual(['X']);
    }
  });

  it('le colonne a testo emettono il loro parametro', () => {
    for (const c of COLONNE_TESTO) {
      const f = filtriVuoti();
      f.testi[c] = 'abc';
      expect(parametriQuery(f, 'dunning', 300).get(c)).toBe('abc');
    }
  });

  it('scadenza e pianificazione emettono i loro', () => {
    const f = filtriVuoti();
    f.scadenza = 'scaduti';
    f.pianificazione.senzaEsecutore = true;
    f.pianificazione.pianificazione = 'non_pianificati';
    const qs = parametriQuery(f, 'dunning', 300);
    expect(qs.get('scadenza')).toBe('scaduti');
    expect(qs.get('senzaEsecutore')).toBe('1');
    expect(qs.get('pianificazione')).toBe('non_pianificati');
  });

  it('il gruppo e` una colonna del registro, quindi filtra come le altre', () => {
    // `microarea` e` un intero in banca dati ma una spunta come tutte le altre: e` importante che
    // stia in COLONNE_ELENCO e non in una scorciatoia lato client, o filtrerebbe le 300 righe.
    expect(COLONNE_ELENCO).toContain('microarea');
    const f = filtriVuoti();
    f.elenchi.microarea = ['12', '13'];
    expect(parametriQuery(f, 'dunning', 300).getAll('microarea')).toEqual(['12', '13']);
  });
});

describe('scheda «Sostituzione saracinesca»', () => {
  it('e` uno stato leggibile dalla URL come gli altri tre', () => {
    expect(q('stato=saracinesche').stato).toBe('saracinesche');
    expect(parametriQuery({ ...filtriVuoti(), stato: 'saracinesche' }, 'dunning', 300).get('stato'))
      .toBe('saracinesche');
  });

  /*
    La scheda va incrociata, non filtrata da Postgres: la saracinesca sta in
    `acea_master_snapshot`, non in `acea_ordini`. Se `serveIncrocio` non la riconoscesse, la route
    prenderebbe il percorso normale e la scheda mostrerebbe TUTTO il registro invece del
    sottoinsieme — un errore che a schermo sembra una scheda che funziona, con solo il conteggio
    fuori posto.
  */
  it('accende l’incrocio, altrimenti la scheda mostrerebbe tutto il registro', () => {
    expect(serveIncrocio(q('stato=saracinesche'))).toBe(true);
    expect(serveIncrocio(q('stato=aperti'))).toBe(false);
    expect(serveIncrocio(q(''))).toBe(false);
  });

  it('l’incrocio si accende anche per i filtri di pianificazione', () => {
    expect(serveIncrocio(q('senzaEsecutore=1'))).toBe(true);
    expect(serveIncrocio(q('stato=saracinesche&esecutore=ROSSI'))).toBe(true);
  });

  it('un valore ignoto resta «tutti», non diventa una scheda inesistente', () => {
    expect(q('stato=saracinesca').stato).toBe('tutti');
  });
});

/*
  L'ordinamento e` l'ALTRO asse della stessa onesta` dei filtri.

  Ordinava le sole righe scese — 300 su 5.000+ — quindi «il primo gruppo» era il primo delle righe
  capitate a schermo, non del registro. Invisibile guardando la tabella: una tabella ordinata male
  sembra una tabella ordinata bene, e chi monta un giro sul «primo gruppo» parte dal posto
  sbagliato senza avere niente che glielo dica.
*/
describe('ordinamento sul registro intero', () => {
  it('la colonna scelta e il verso arrivano al server', () => {
    const f = filtriVuoti();
    f.ordina = 'gruppo';
    f.verso = 'desc';
    const qs = parametriQuery(f, 'dunning', 300);
    expect(qs.get('ordina')).toBe('gruppo');
    expect(qs.get('verso')).toBe('desc');
  });

  it('senza ordinamento non si sporca la query', () => {
    const qs = parametriQuery(filtriVuoti(), 'dunning', 300);
    expect(qs.has('ordina')).toBe(false);
    expect(qs.has('verso')).toBe(false);
  });

  it('il server rilegge quello che il client ha scritto', () => {
    expect(q('ordina=scadenza&verso=desc')).toMatchObject({ ordina: 'scadenza', verso: 'desc' });
    expect(q('ordina=gruppo').verso).toBe('asc');
  });

  // Una colonna inventata nella URL non deve diventare un `.order()` su un campo inesistente:
  // Postgres rifiuterebbe la query e la tabella resterebbe vuota senza dire perche`.
  it('una colonna ignota cade sull’ordine canonico', () => {
    expect(q('ordina=pippo').ordina).toBeNull();
    expect(q('ordina=lat').ordina).toBeNull();
    expect(q('verso=diagonale').verso).toBe('asc');
  });

  it('ogni colonna ordinabile del registro punta a un campo, quelle incrociate no', () => {
    for (const [chiave, spec] of Object.entries(ORDINAMENTI)) {
      if (spec.tipo === 'registro') expect(spec.campo).toBeTruthy();
      else expect(spec).toEqual({ tipo: 'incrocio' });
      expect(ordinabile(chiave)).toBe(true);
    }
  });

  // Le due colonne della pianificazione vivono in `interventi`: Postgres non le vede, quindi
  // ordinarle richiede lo stesso incrocio dei loro filtri. Se `serveIncrocio` non le riconoscesse,
  // la route prenderebbe il percorso normale e l'ordinamento verrebbe semplicemente ignorato.
  it('ordinare per esecutore o per giorno accende l’incrocio', () => {
    expect(serveIncrocio(q('ordina=pianificato_a'))).toBe(true);
    expect(serveIncrocio(q('ordina=pianificato_il'))).toBe(true);
    expect(serveIncrocio(q('ordina=gruppo'))).toBe(false);
    expect(serveIncrocio(q('ordina=scadenza'))).toBe(false);
  });

  it('le colonne non ordinabili restano fuori dalla mappa, non ci finiscono a meta`', () => {
    // Le tre delle saracinesche derivano da un aggancio per impianto o matricola che non e` una
    // colonna: meglio nessun comando che un comando che ordina solo il caricato.
    for (const c of ['saracinesca', 'odl_saracinesca', 'stato_saracinesca']) {
      expect(ordinabile(c)).toBe(false);
    }
  });
});
