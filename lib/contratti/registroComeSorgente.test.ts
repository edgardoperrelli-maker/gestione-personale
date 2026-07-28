import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Il menu COMMITTENTE della Tassonomia attività deve leggere dal REGISTRO (`committenti`,
// modulo Contratti), non da un elenco cablato nel client.
//
// Nasce da un difetto reale segnalato dall'ufficio: dopo aver aperto la commessa
// AcquaLatina, il menu continuava a offrire solo ACEA / Italgas / Altro, quindi non si
// poteva censire nessuna attività del nuovo committente. Il database la accettava già
// (il CHECK era stato allargato) e l'API non valida il committente: il blocco era solo
// nella UI, che portava `const COMMITTENTI_ORDER = ['acea','italgas','altro']`.
//
// È il difetto che si ripete da solo: aprire una commessa e scoprire settimane dopo che
// una schermata non la conosce. La guardia sta sulla SORGENTE, non sui nomi: elencare
// «deve esserci acqualatina» non servirebbe al prossimo committente.

const radice = resolve(__dirname, '../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

const PAGE = leggi('app/impostazioni/attivita-tassonomia/page.tsx');
const CLIENT = leggi('app/impostazioni/attivita-tassonomia/AttivitaTassonomiaClient.tsx');
const INTERVENTI_PAGE = leggi('app/hub/interventi/page.tsx');
const STORICO_FILTRI = leggi('components/modules/interventi/StoricoFiltri.tsx');

describe('Tassonomia attività — i committenti vengono dal registro', () => {
  it('la pagina li carica da `lib/contratti/dati`', () => {
    expect(PAGE).toMatch(/from '@\/lib\/contratti\/dati'/);
    expect(PAGE).toMatch(/caricaCommittenti\(\)/);
  });

  it('passa la lista al client invece di lasciargliela inventare', () => {
    expect(PAGE).toMatch(/<AttivitaTassonomiaClient\s+committenti=/);
    expect(CLIENT).toMatch(/committenti: OpzioneCommittente\[\]/);
  });

  it('il client non porta più un elenco di committenti cablato', () => {
    // Né come costante, né come union type: erano le due forme presenti.
    expect(CLIENT).not.toMatch(/COMMITTENTI_ORDER/);
    expect(CLIENT).not.toMatch(/'acea'\s*\|\s*'italgas'/);
    expect(CLIENT).not.toMatch(/\[\s*'acea'\s*,\s*'italgas'/);
  });

  it('«Altro» resta previsto, e in fondo: è il catch-all, non un committente', () => {
    // Non sta nel registro perché non è una commessa: è il ramo che `risolviGruppo`
    // sonda quando l'attività non appartiene a nessuno in particolare.
    expect(PAGE).toMatch(/codice: 'altro'/);
    expect(PAGE).toMatch(/\[\.\.\.committenti, ALTRO\]/);
  });

  it('offre solo i committenti con un codice di runtime', () => {
    // Senza codice non possono comparire su `attivita_tassonomia`: offrirli sarebbe
    // un menu che produce righe che il CHECK del database rifiuta.
    expect(PAGE).toMatch(/\.filter\(\(c\) => c\.codice\)/);
  });
});

describe('Storico interventi — anche il filtro committente viene dal registro', () => {
  it('la pagina carica i committenti da `lib/contratti/dati`', () => {
    expect(INTERVENTI_PAGE).toMatch(/from '@\/lib\/contratti\/dati'/);
    expect(INTERVENTI_PAGE).toMatch(/caricaCommittenti\(\)/);
    expect(INTERVENTI_PAGE).toMatch(/committenti=\{committenti\}/);
  });

  it('il pannello filtri non porta più un elenco cablato', () => {
    // Era `const COMMITTENTI = [{ value: 'acea' }, { value: 'italgas' }, { value: 'altro' }]`.
    expect(STORICO_FILTRI).not.toMatch(/const COMMITTENTI\s*=/);
    expect(STORICO_FILTRI).not.toMatch(/value: 'italgas'/);
    expect(STORICO_FILTRI).toMatch(/committenti: \{ value: string; label: string \}\[\]/);
  });

  it('«Altro» resta selezionabile: è un valore scritto davvero su `interventi`', () => {
    // Diverso dal caso tassonomia: qui non è solo un catch-all di risoluzione, è un
    // codice che sta sulle righe. Toglierlo renderebbe quelle righe non isolabili.
    expect(INTERVENTI_PAGE).toMatch(/value: 'altro'/);
  });

  it('il filtro regge qualunque codice: la sola equivalenza è lim_massive → acea', () => {
    // È ciò che rende sufficiente aggiungere l'opzione, senza toccare la query:
    // `filtraRighe` confronta con `committenteEquivalente`, che non collassa gli altri.
    const equivalenza = leggi('lib/attivita/tassonomia.ts');
    expect(equivalenza).toMatch(/c === 'lim_massive' \? 'acea' : c/);
  });
});
