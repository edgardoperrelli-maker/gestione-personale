import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLONNE_ACQUALATINA, type ChiaveColonna } from '../acea/colonneTabella';
import { COLONNE_TESTO, espressioneRicerca, leggiFiltri } from '../acea/filtriOrdini';

/*
  L'ANAGRAFICA DELL'UTENTE, dal file del committente fino al telefono dell'operatore.

  Nasce da una segnalazione dell'ufficio sulla tabella di pianificazione AcquaLatina: «mancano
  dati — nome utente, recapito utente, codice fornitura che sarebbe l'impianto». Erano tre buchi
  con tre cause diverse, e la più istruttiva è la prima: il COD. FORNITURA c'era su tutte e 4.196
  le righe del registro e nessuna cella lo mostrava. Un dato arrivato fin dentro il database per
  non essere letto da nessuno non si vede in nessun test che guardi una funzione alla volta —
  ogni pezzo funzionava.

  Perciò le guardie stanno sulla CATENA, non sui singoli pezzi: dove il dato entra (il parser del
  master), dove si ferma (il registro), dove si legge (le colonne), dove scende (la
  pianificazione, che crea l'intervento) e dove serve davvero (la voce di rapportino). Un anello
  che si stacca fa cadere il test dell'anello, non quello di tutta la catena — e allora la catena
  non la sorveglia nessuno.
*/

const radice = resolve(__dirname, '../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

describe('la tabella di pianificazione mostra le tre colonne segnalate', () => {
  const perChiave = (c: ChiaveColonna) => COLONNE_ACQUALATINA.find((x) => x.chiave === c);

  it('cod. fornitura, nome utente e recapito ci sono, e sono a schermo di default', () => {
    // `predefinita` e non solo «presente»: una colonna attivabile dal menu Colonne sarebbe
    // rimasta nascosta esattamente come quando non c'era — è il difetto segnalato.
    for (const chiave of ['impianto', 'nominativo', 'recapito'] as const) {
      expect(perChiave(chiave), `manca la colonna ${chiave}`).toBeDefined();
      expect(perChiave(chiave)?.predefinita, `${chiave} non è a schermo`).toBe(true);
    }
  });

  it('l\'impianto si chiama COD. FORNITURA: è la parola del committente', () => {
    // Nel file di AcquaLatina la colonna è COD_FORNITURA ed è così che l'ufficio la nomina al
    // telefono con loro. «Impianto» è il nome ACEA della stessa cosa, e su questa vista
    // manderebbe a cercare una colonna che nel loro gergo non esiste.
    expect(perChiave('impianto')?.intestazione).toMatch(/fornitura/i);
  });

  it('il nome utente si filtra; il recapito no', () => {
    // Il nome è il modo in cui l'ufficio ritrova una riga quando ha il nome e non l'ODL.
    expect(perChiave('nominativo')?.filtro).toEqual({ tipo: 'testo', campo: 'nominativo' });
    // Un «contiene» su un numero di telefono non risponde a nessuna domanda: l'imbuto in più
    // sarebbe solo rumore in testata.
    expect(perChiave('recapito')?.filtro).toBeUndefined();
  });
});

describe('il filtro e la ricerca conoscono il nome utente', () => {
  it('`nominativo` è una colonna a testo del server, non solo un\'etichetta', () => {
    // Senza questo il filtro di colonna si disegnerebbe e non filtrerebbe niente: la tabella
    // carica una pagina per volta, quindi filtrare il caricato mostrerebbe un sottoinsieme di
    // un sottoinsieme con un conteggio che non corrisponde a nulla.
    expect(COLONNE_TESTO).toContain('nominativo');
    expect(leggiFiltri(new URLSearchParams('nominativo=rossi')).testi.nominativo).toBe('rossi');
  });

  it('la ricerca libera lo attraversa', () => {
    expect(espressioneRicerca(leggiFiltri(new URLSearchParams('cerca=rossi'))))
      .toContain('nominativo.ilike.*rossi*');
  });
});

describe('il dato scende fino alla voce di rapportino', () => {
  /*
    Guardie sulla SORGENTE e non sul comportamento: sono route server che parlano con Supabase, e
    montarle in un test vorrebbe dire un finto database che direbbe di sì a qualunque cosa. Qui
    interessa una cosa sola, ed è testuale: che quei campi compaiano nella scrittura.
  */
  const PIANIFICA = leggi('app/api/acea/pianifica/route.ts');
  const SINCRONIZZA = leggi('lib/acea/sincronizzaRapportiniAcea.ts');

  it('la pianificazione legge l\'anagrafica dal registro', () => {
    expect(PIANIFICA).toMatch(/select\('id, odl[^']*impianto, nominativo, recapito'\)/);
  });

  it('e la scrive sull\'intervento che crea', () => {
    // È il buco vero: le 25 righe pianificate per il 03/08 sono nate senza PDR e senza nome
    // utente, mentre le 254 arrivate dal vecchio percorso ce li avevano. Il rapportino
    // dell'operatore mostra quei campi (sono fra gli info campi di default) e li trovava vuoti.
    expect(PIANIFICA).toMatch(/pdr: a\.ordine\.impianto/);
    expect(PIANIFICA).toMatch(/nominativo: a\.ordine\.nominativo/);
    expect(PIANIFICA).toMatch(/recapito: a\.ordine\.recapito/);
  });

  it('il motore dei rapportini porta il recapito sulla voce', () => {
    // `nominativo` e `pdr` ci passavano già; il recapito non aveva un canale sul percorso
    // registro — la colonna su `interventi` è nata con questa modifica.
    expect(SINCRONIZZA).toMatch(/matricola_contatore, nominativo, pdr, recapito/);
    expect(SINCRONIZZA).toMatch(/recapito: i\.recapito/);
  });
});

describe('la forma della select condivisa resta valida su entrambi i registri', () => {
  /*
    UNA select serve tre famiglie su DUE tabelle (`acea_ordini`, `acqualatina_ordini`): una
    colonna aggiunta all'elenco e non a tutte e due fa cadere la vista con «column does not
    exist» — non una decorazione, la query del registro, cioè il motivo per cui si apre la
    schermata. Il contratto è dichiarato in 20260731170000_acqualatina_ordini.sql; questo test è
    la sua guardia per le due colonne nuove.
  */
  const ROUTE = leggi('app/api/acea/ordini/route.ts');
  const MIGRAZIONE = leggi('supabase/migrations/20260802140000_acqualatina_anagrafica_utente.sql');

  it('la select espone le due colonne nuove', () => {
    expect(ROUTE).toMatch(/'nominativo', 'recapito',/);
  });

  it('la migrazione le crea su TUTTI E DUE i registri', () => {
    for (const tabella of ['acqualatina_ordini', 'acea_ordini']) {
      for (const colonna of ['nominativo', 'recapito']) {
        expect(
          MIGRAZIONE,
          `${tabella}.${colonna} non viene creata: la vista cadrebbe con column does not exist`,
        ).toMatch(new RegExp(`alter table public\\.${tabella} add column if not exists ${colonna}`));
      }
    }
  });

  it('e crea il recapito su `interventi`, che è il passaggio verso la voce', () => {
    expect(MIGRAZIONE).toMatch(/alter table public\.interventi add column if not exists recapito/);
  });

  it('il recupero non sovrascrive mai un dato già presente', () => {
    // Ogni UPDATE della migrazione riempie SOLO il vuoto. Un backfill che sovrascrive
    // cancellerebbe le correzioni fatte a mano in ufficio, che è il modo più veloce di far
    // perdere fiducia in una schermata.
    const update = MIGRAZIONE.match(/^update public\.\w+ \w+$/gm) ?? [];
    expect(update.length).toBeGreaterThan(0);
    expect((MIGRAZIONE.match(/coalesce\([^)]*\) = ''/g) ?? []).length)
      .toBeGreaterThanOrEqual(update.length);
  });
});
