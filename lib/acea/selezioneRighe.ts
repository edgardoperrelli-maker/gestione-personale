// lib/acea/selezioneRighe.ts
// PURA: quali righe risultano selezionate dopo un click, con o senza shift.
//
// Vive fuori dal componente perché è la regola che si è rotta una volta e non deve rirompersi: lo
// shift-click è il gesto con cui si prende un blocco di ordini prima di assegnarlo a una squadra, e
// quando smette di funzionare si torna a spuntare venti caselle a mano.
//
// COM'ERA ROTTO. Il checkbox aveva due gestori: `onChange` per il toggle e `onClick` per
// l'intervallo. React ricava l'evento `change` di un checkbox DAL CLICK stesso, e `preventDefault()`
// non lo sopprime: su uno shift-click partivano entrambi. Peggio, entrambi leggevano lo stato dalla
// stessa closure di render e ricostruivano la selezione da zero (`{ ...selezione }`), quindi la
// seconda chiamata sovrascriveva l'intervallo appena scelto. Lo shift-click si comportava come un
// click normale, senza nessun errore a dirlo.
//
// La lezione, e il motivo per cui la regola sta qui: un gesto solo deve passare per un percorso
// solo. Il componente ora chiama questa funzione UNA volta per click.

export type SelezioneRighe = Record<string, boolean>;

export type EsitoSelezione = {
  selezione: SelezioneRighe;
  /** Nuova ancora per il prossimo shift-click. */
  ancora: number;
};

/**
 * La selezione dopo un click sulla riga `indice`.
 *
 * - click semplice: accende o spegne quella riga, e ci pianta l'ancora;
 * - shift-click: accende tutto l'intervallo fra l'ancora e la riga cliccata, senza spegnere niente
 *   di quanto già scelto, e LASCIA l'ancora dov'è — così si può allargare l'intervallo con più
 *   shift-click di fila, che è il modo in cui lo si usa davvero;
 * - shift-click senza un'ancora (primo gesto della sessione): vale come un click semplice, perché
 *   un intervallo con un solo estremo non esiste.
 *
 * `ids` sono le righe NELL'ORDINE IN CUI SI VEDONO, non nell'ordine di caricamento: l'intervallo
 * che l'utente traccia con gli occhi è quello della tabella ordinata, e usare un altro ordine
 * selezionerebbe righe che non stanno fra le due cliccate.
 */
export function selezionaRighe(
  selezione: SelezioneRighe,
  ids: readonly string[],
  indice: number,
  shift: boolean,
  ancora: number | null,
): EsitoSelezione {
  // Un indice fuori elenco non deve produrre `undefined` come chiave: la selezione si porterebbe
  // dietro una riga che non esiste, e il contatore direbbe un numero più alto delle righe scelte.
  if (indice < 0 || indice >= ids.length) {
    return { selezione, ancora: ancora ?? 0 };
  }

  if (shift && ancora !== null && ancora >= 0 && ancora < ids.length) {
    const da = Math.min(ancora, indice);
    const a = Math.max(ancora, indice);
    const agg: SelezioneRighe = { ...selezione };
    for (let i = da; i <= a; i++) agg[ids[i]] = true;
    return { selezione: agg, ancora };
  }

  const agg: SelezioneRighe = { ...selezione };
  const id = ids[indice];
  if (agg[id]) delete agg[id];
  else agg[id] = true;
  return { selezione: agg, ancora: indice };
}
