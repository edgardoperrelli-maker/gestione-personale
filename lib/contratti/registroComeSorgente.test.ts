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

const dir = resolve(__dirname, '../../app/impostazioni/attivita-tassonomia');
const PAGE = readFileSync(resolve(dir, 'page.tsx'), 'utf8');
const CLIENT = readFileSync(resolve(dir, 'AttivitaTassonomiaClient.tsx'), 'utf8');

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
