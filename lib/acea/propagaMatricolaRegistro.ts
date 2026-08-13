// lib/acea/propagaMatricolaRegistro.ts
// La matricola corretta in GRIGLIA che scende sugli interventi e sulle loro voci di rapportino.
//
// Perché non basta scriverla a registro. Su AcquaLatina l'unità di lavoro è la coppia
// (ODL, matricola): la griglia incrocia registro e interventi con la chiave `odl#matricola_norm`
// (`app/api/acea/ordini/route.ts`), e la dedup degli interventi ha la matricola dentro l'indice
// unico. Cambiare la sola riga di registro spezzerebbe quell'incrocio — la riga perderebbe a
// schermo esecutore, giorno ed esito, cioè sembrerebbe non pianificata mentre qualcuno ci sta
// andando. Il dato non si perde: diventa invisibile, che è peggio.
//
// La catena è di quattro anelli, e li percorre tutti: registro (già scritto dalla route) →
// `interventi` → `rapportino_voci` (quello che l'operatore legge sul posto) → registro dei
// misuratori rimossi (quello che si consegna al committente).
import type { SupabaseClient } from '@supabase/supabase-js';
import { tabellaMisuratori } from '@/lib/interventi/storico/modifica';
import { eConflittoUnicita } from './matricolaCella';
import type { ProfiloCommessa } from './famiglia';

export type EsitoPropagazione = {
  /** Interventi realmente riallineati. */
  interventi: number;
  /**
   * Il motivo per cui un intervento NON ha potuto seguire la correzione, se è successo.
   *
   * Quasi sempre uno solo, e sempre lo stesso: gli indici unici di `interventi` per acqualatina
   * (stesso ODL + matricola nello stesso giorno, o due positivi sulla stessa coppia). Il
   * registro a quel punto è già corretto — la fonte è a posto — ma l'uscita è rimasta indietro,
   * e chi ha corretto deve saperlo perché è l'unico a poter decidere quale delle due tenere.
   */
  avviso: string | null;
};

/**
 * Riallinea gli interventi di una riga di registro alla matricola appena corretta.
 *
 * Due bersagli, e servono entrambi:
 *  - quelli AGGANCIATI (`ordine_id`), che sono la norma;
 *  - quelli SCIOLTI con la vecchia matricola sullo stesso ODL. Non tutti gli interventi nascono
 *    dalla pianificazione che scrive `ordine_id` (i «+» compilati sul campo, il vecchio percorso
 *    su file): senza questo secondo passaggio resterebbero indietro con la matricola vecchia, e
 *    `agganciPerOdl` non li salverebbe — riaggancia solo «a scelta obbligata», e con la matricola
 *    sbagliata su un ODL multi-contatore la scelta obbligata non c'è.
 *
 * Best-effort per costruzione: la scrittura sul registro è già passata ed è quella che conta.
 * Qui si riporta cosa è riuscito e cosa no, invece di far fallire tutto all'indietro.
 */
export async function propagaMatricolaAInterventi(
  db: SupabaseClient,
  ordine: { id: string; odl: string; matricolaVecchia: string | null },
  matricola: string,
  profilo: ProfiloCommessa,
): Promise<EsitoPropagazione> {
  const committenti = profilo.committenti;
  const ids = new Set<string>();
  let avviso: string | null = null;

  const scrivi = async (applica: (q: ReturnType<SupabaseClient['from']>) => unknown) => {
    const { data, error } = (await applica(db.from('interventi'))) as {
      data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null;
    };
    if (error) {
      if (eConflittoUnicita(error)) {
        avviso = `ODL ${ordine.odl}: la matricola è corretta a registro, ma un intervento non ha `
          + 'potuto seguirla — su quell’ODL esiste già un’uscita con questa matricola. '
          + 'Va sistemata dal modulo Interventi.';
      } else {
        console.error('[acea/celle] matricola non propagata agli interventi:', error.message);
      }
      return;
    }
    for (const r of data ?? []) ids.add(r.id);
  };

  await scrivi((q) => q
    .update({ matricola_contatore: matricola })
    .eq('ordine_id', ordine.id)
    .in('committente', [...committenti])
    .neq('stato', 'annullato')
    .select('id'));

  // Gli sciolti si riconoscono dalla matricola VECCHIA: senza di quella non c'è niente che li
  // leghi a questa riga (l'ODL da solo, su un ordine multi-contatore, ne prenderebbe altri).
  if (ordine.matricolaVecchia && ordine.matricolaVecchia.trim() !== '') {
    await scrivi((q) => q
      .update({ matricola_contatore: matricola })
      .is('ordine_id', null)
      .eq('odl', ordine.odl)
      .eq('matricola_contatore', ordine.matricolaVecchia)
      .in('committente', [...committenti])
      .neq('stato', 'annullato')
      .select('id'));
  }

  if (ids.size === 0) return { interventi: 0, avviso };

  // L'ultimo anello: la voce di rapportino, che l'operatore ha già in mano. Fermarsi
  // all'intervento lascerebbe la matricola vecchia stampata sulla card del contatore da
  // sostituire — ed è proprio quella che si legge sul posto.
  const { error: eVoci } = await db
    .from('rapportino_voci')
    .update({ matricola })
    .in('intervento_id', [...ids]);
  if (eVoci) console.error('[acea/celle] matricola non propagata alle voci:', eVoci.message);

  /*
    E il registro dei MISURATORI RIMOSSI, che è il quarto e ultimo posto dove quella matricola
    vive — il contatore smontato, dal deposito alla riconsegna al committente.

    Non si ripara da solo: il «Ricalcola» di quel registro riscrive `data_esecuzione` sulle
    righe già agganciate e nient'altro (vedi `lib/interventi/storico/modifica.ts`). Senza questo
    passaggio si consegnerebbe al committente un contatore col numero tronco, cioè l'errore
    appena corretto sopravviverebbe proprio nel documento che esce dall'azienda.

    La tabella è quella della COMMESSA: ognuna ha la sua (AGENTS.md §13), e scrivere sempre su
    quella ACEA sarebbe un `update` che non trova righe — zero righe non è un errore per
    PostgREST, quindi il registro gemello resterebbe sbagliato in silenzio.
  */
  const { error: eMis } = await db
    .from(tabellaMisuratori(profilo.committenteScrittura))
    .update({ matricola })
    .in('intervento_id', [...ids]);
  if (eMis) console.error('[acea/celle] matricola non propagata ai misuratori rimossi:', eMis.message);

  return { interventi: ids.size, avviso };
}
