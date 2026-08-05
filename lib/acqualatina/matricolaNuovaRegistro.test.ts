import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLONNE_ACQUALATINA, COLONNE_DUNNING, COLONNE_MASSIVE, valoreCella,
  type ChiaveColonna, type RigaTabella,
} from '../acea/colonneTabella';
import { ordinabile } from '../acea/filtriOrdini';

/*
  LA MATRICOLA DEL MISURATORE INSTALLATO, dal telefono dell'operatore alla cella del registro.

  La catena è: azione del flusso («MATRICOLA NUOVO MISURATORE», chiave `matricola_nuova`) →
  `rapportino_voci.risposte` → lettura della route del registro → colonna «Matricola nuova».

  Il punto fragile non è nessuno dei pezzi: è la CHIAVE, che compare in due posti scritti da due
  parti diverse — la migrazione che crea l'azione e la route che legge la risposta. Se una delle
  due viene rinominata, ogni pezzo continua a funzionare e la colonna resta vuota per sempre,
  senza un errore da nessuna parte: si leggerebbe come «gli operatori non la compilano».
*/

const radice = resolve(__dirname, '../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

const CHIAVE = 'matricola_nuova';

const riga = (over: Partial<RigaTabella> = {}): RigaTabella => ({
  odl: '12380195', numero_operazione: '0010', famiglia: 'acqualatina', tipo_ordine: null,
  attivita: 'Sostituzione misuratore', stato: 'DAPI', stato_desc: 'Da pianificare',
  aperto: true, data_creazione: '2026-07-31', cardine_al: null, scadenza: null,
  data_completamento: null, operatore_cognome: null, causale: null, causale_desc: null,
  esito_positivo: null, via: 'VIA ALFA', civico: '10', cap: null, comune: 'TERRACINA',
  microarea: null, impianto: '900123456', nominativo: 'MARIO ROSSI', recapito: '333 1122334',
  matricola: '19AB000111', valore_netto: null, escludi_consuntivazione: false, codice_sla: null,
  priorita_testo: null, centro_lavoro: null, sospetto_troncamento: false, saracinesca: null,
  odl_saracinesca: null, stato_saracinesca: null, note: null, pianificato_il: null,
  pianificato_a: null, stato_intervento: null,
  ...over,
});

describe('la colonna «Matricola nuova» nel registro AcquaLatina', () => {
  const colonna = COLONNE_ACQUALATINA.find((c) => c.chiave === CHIAVE);

  it('c\'è ed è a schermo di default', () => {
    // `predefinita`: una colonna da accendere dal menu Colonne resterebbe nascosta esattamente
    // come quando non c'era.
    expect(colonna, 'manca la colonna matricola_nuova').toBeDefined();
    expect(colonna?.predefinita).toBe(true);
  });

  it('sta subito accanto alla matricola da sostituire', () => {
    // È il senso della colonna: la domanda dell'ufficio è il passaggio dall'una all'altra
    // («su quell'ODL cosa ci abbiamo messo?»), e con dieci colonne di mezzo non si legge.
    const chiavi = COLONNE_ACQUALATINA.map((c) => c.chiave);
    expect(chiavi[chiavi.indexOf('matricola') + 1]).toBe(CHIAVE);
  });

  it('non porta imbuto né ordinamento: il valore non sta nel registro', () => {
    // Come «Eseguito» nelle massive. Filtrare o ordinare le sole righe scese direbbe una bugia
    // sul conteggio, che è la ragione per cui le colonne senza `campo` non hanno l'imbuto.
    expect(colonna?.filtro).toBeUndefined();
    expect(ordinabile(CHIAVE)).toBe(false);
  });

  it('mostra il valore così com\'è, e un trattino quando non c\'è', () => {
    expect(valoreCella(riga({ matricola_nuova: 'AL26A0012345' }), CHIAVE)).toBe('AL26A0012345');
    // Il trattino è «non ancora sostituito», e va distinto a colpo d'occhio da una matricola.
    expect(valoreCella(riga(), CHIAVE)).toBe('—');
  });

  it('resta fuori dalle viste ACEA: è un fatto di questa commessa', () => {
    for (const colonne of [COLONNE_DUNNING, COLONNE_MASSIVE]) {
      expect(colonne.some((c) => c.chiave === (CHIAVE as ChiaveColonna))).toBe(false);
    }
  });
});

describe('la chiave della risposta è la stessa da capo a fondo', () => {
  const MIGRAZIONE = leggi('supabase/migrations/20260803160000_acqualatina_matricola_nuova.sql');
  const ROUTE = leggi('app/api/acea/ordini/route.ts');

  it('l\'azione del flusso e la lettura del registro usano la stessa chiave', () => {
    // LA guardia di questo file: due file scritti a distanza, una sola parola in comune.
    expect(MIGRAZIONE).toMatch(new RegExp(`'chiave',\\s*'${CHIAVE}'`));
    expect(ROUTE).toContain(`risposte['${CHIAVE}']`);
  });

  it('la route porta il valore sulla riga: la colonna persistita vince, la scansione fa da riserva', () => {
    // Da quando `matricola_nuova` è una colonna vera di `acqualatina_ordini` (migration
    // 20260805110000), la lettura preferisce quella — è quella che l'ufficio corregge in
    // griglia — e la scansione delle risposte resta solo per le righe non ancora propagate.
    expect(ROUTE).toMatch(/matricola_nuova:\s*matricolaNuovaColonna\.get\(chiaveRiga\)/);
    expect(ROUTE).toMatch(new RegExp(`${CHIAVE}:.*matricolaNuovaPerChiave\\.get\\(chiaveRiga\\)`));
  });

  /*
    LA REGRESSIONE DEL 05/08: `matricola_nuova` è finita nella `COLONNE` principale (la select
    condivisa fra ACEA e AcquaLatina), il deploy del codice è arrivato prima che la migration
    20260805110000 fosse applicata in produzione, e OGNI vista del registro — non solo
    AcquaLatina — ha risposto «Errore lettura registro ACEA» finché la colonna non è comparsa.
    Stessa medicina già scritta per `pianificato_*_bozza` (il commento appena sotto `COLONNE` lo
    dice esplicitamente): una colonna nata da poco si legge A PARTE, mai nella select principale.
  */
  it('NON sta nella COLONNE principale: una migration non ancora applicata non deve spegnere il registro', () => {
    const blocco = /const COLONNE = \[([\s\S]*?)\]\.join\(', '\);/.exec(ROUTE)?.[1] ?? '';
    expect(blocco, 'blocco COLONNE non trovato: la regex è da aggiornare, non silenziare').not.toBe('');
    expect(blocco).not.toMatch(/['"]matricola_nuova['"]/);
  });

  it('si legge a parte, con la stessa degradazione best-effort delle altre colonne recenti', () => {
    expect(ROUTE).toContain("select('odl, numero_operazione, matricola_nuova')");
    expect(ROUTE).toContain('[acea/ordini] colonna matricola_nuova non letta:');
  });

  it('la lettura delle risposte NON parte sulle viste che non disegnano la colonna', () => {
    // Una lettura in più a ogni pagina per un valore che nessuno guarda: la stessa regola con
    // cui il triangolo delle riaperture e le schede-comune non si calcolano fuori casa loro.
    expect(ROUTE).toContain('if ((serveEseguito || acqua) && interventiPerChiave.size > 0)');
  });

  it('è una DECORAZIONE: se la lettura cade, la tabella si carica lo stesso', () => {
    // Il registro è il motivo per cui si apre la schermata. Una colonna accessoria che lo porta
    // giù è già successo una volta, con le saracinesche.
    expect(ROUTE).toContain("console.error('[acea/ordini] risposte dei rapportini non lette:'");
  });
});
