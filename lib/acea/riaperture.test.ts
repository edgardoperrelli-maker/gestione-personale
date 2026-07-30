import { describe, expect, it } from 'vitest';
import { eRiapertura, SLA_RIAPERTURA, scadenzaOrdine } from './scadenza';

/*
  Le riaperture — dette anche attivazioni.

  Perché meritano un file loro invece di una riga in mezzo ai test delle scadenze: non sono un
  dettaglio del calcolo, sono un SOTTOINSIEME che si guarda a parte. La scheda «Riaperture» e
  l'ordinamento predefinito della tabella devono chiedersi la stessa domanda che si chiede il
  calcolo della scadenza, e questo file è il posto dove quella domanda resta una sola.

  Il fatto misurato che ci sta sotto: sul registro vero le riaperture aperte sono 14 su 924 ordini
  di dunning aperti, e nell'ordinamento per scadenza cadono alle righe 491-548. Hanno un giorno di
  cardine contro quattordici, ma ordinare per scadenza porta in cima il più VECCHIO — quindi il
  lavoro più urgente finisce in mezzo alla tabella, sotto limitazioni scadute da due mesi.
*/

describe('eRiapertura', () => {
  it('riconosce i due codici, e nient’altro', () => {
    expect(eRiapertura('RIAT')).toBe(true);
    expect(eRiapertura('REVO')).toBe(true);
    expect(eRiapertura('NSLA')).toBe(false);
  });

  // L'export ACEA non è normalizzato: gli stessi codici arrivano in minuscolo e con spazi attorno.
  // Una riapertura non riconosciuta per uno spazio è una riapertura che scade domani e non si vede.
  it('non si fa fermare da maiuscole e spazi', () => {
    expect(eRiapertura(' riat ')).toBe(true);
    expect(eRiapertura('Revo')).toBe(true);
  });

  // `codice_sla` è nullo su tutte le massive: deve rispondere «no», non esplodere.
  it('l’assenza di SLA non e` una riapertura', () => {
    expect(eRiapertura(null)).toBe(false);
    expect(eRiapertura(undefined)).toBe(false);
    expect(eRiapertura('')).toBe(false);
    expect(eRiapertura('   ')).toBe(false);
  });

  /*
    La colonna `riapertura` in Postgres è generata da `coalesce(codice_sla,'') in ('RIAT','REVO')`,
    cioè da una copia SQL di questa regola. Sono due scritture della stessa cosa, in due linguaggi
    che non si parlano: se divergono, la scheda mostra un insieme e l'ordinamento ne mette in cima
    un altro, e a schermo sembrano entrambe funzionare.

    Questo test non può interrogare Postgres, ma può fissare l'elenco su cui le due si accordano:
    chi cambia i codici qui vede fallire un test che nomina la migration.
  */
  it('i codici sono esattamente quelli della colonna generata (migration acea_riaperture)', () => {
    expect([...SLA_RIAPERTURA]).toEqual(['RIAT', 'REVO']);
    for (const c of SLA_RIAPERTURA) expect(eRiapertura(c)).toBe(true);
  });
});

describe('perché le riaperture sfuggono', () => {
  /*
    La dimostrazione in due righe del problema che la scheda risolve.

    Una riapertura creata OGGI scade domani. Una limitazione creata due mesi fa è scaduta da un
    mese e mezzo. Ordinando per scadenza crescente — che è l'ordinamento predefinito, ed è quello
    giusto per il resto del registro — la limitazione vecchia sta SOPRA, e la riapertura urgente
    sprofonda sotto tutte quelle accumulate. Non è un bug dell'ordinamento: è che «più scaduto» e
    «più urgente» sono due cose diverse.
  */
  it('la riapertura di oggi scade DOPO una limitazione vecchia, pur essendo piu` urgente', () => {
    const riapertura = scadenzaOrdine({
      famiglia: 'dunning', codiceSla: 'RIAT', dataCreazione: '2026-07-28',
    });
    const limitazioneVecchia = scadenzaOrdine({
      famiglia: 'dunning', codiceSla: 'NSLA', dataCreazione: '2026-05-21',
    });

    expect(riapertura).toBe('2026-07-29');       // un giorno: cardine contrattuale
    expect(limitazioneVecchia).toBe('2026-06-04'); // quattordici giorni, scaduti da un pezzo
    expect(limitazioneVecchia! < riapertura!).toBe(true);
  });

  // E il giorno solo vale per entrambi i codici, non solo per RIAT.
  it('un giorno per RIAT e per REVO, quattordici per il resto', () => {
    const il = (sla: string) =>
      scadenzaOrdine({ famiglia: 'dunning', codiceSla: sla, dataCreazione: '2026-07-01' });
    expect(il('RIAT')).toBe('2026-07-02');
    expect(il('REVO')).toBe('2026-07-02');
    expect(il('NSLA')).toBe('2026-07-15');
  });

  // Le massive non scadono mai, e un codice SLA non le trasforma in riaperture.
  it('una massiva resta senza scadenza anche con un codice di riapertura', () => {
    expect(scadenzaOrdine({ famiglia: 'massive', codiceSla: 'RIAT', dataCreazione: '2026-07-01' }))
      .toBeNull();
  });
});
