// PURA: dal flusso del rapportino al committente del censimento da scaricare in cache.
//
// Solo due committenti hanno un censimento consultabile dal campo:
//   · ACEA        → `limitazione_misuratori_ref` (percorso limitazioni massive)
//   · AcquaLatina → `template_master_righe` dei master attivi
// Per tutti gli altri (Italgas, «altro», flusso senza committente dichiarato) → null, e la
// modale di scaricamento non compare affatto: un operatore Italgas non deve portarsi in
// cache righe di un master che non gli serve.
//
// La fonte del dato è `rapportino_template.gruppo_committente`, non una colonna nuova su
// `rapportini`: il template lo dichiara già insieme a `gruppi_attivita`, e un CHECK in DB
// impone che i due siano valorizzati insieme o entrambi vuoti. Scegliere il flusso *è*
// scegliere la coppia, e non può produrne una incoerente.

export const COMMITTENTI_CENSIMENTO = ['acea', 'acqualatina'] as const;
export type CommittenteCensimento = (typeof COMMITTENTI_CENSIMENTO)[number];

/** Committente del censimento per il flusso indicato, o null se quel flusso non ne ha uno.
 *  Confronto tollerante a maiuscole e spazi (il valore arriva da una colonna testo). */
export function perimetroCensimento(
  gruppoCommittente: string | null | undefined,
): CommittenteCensimento | null {
  const c = String(gruppoCommittente ?? '').trim().toLowerCase();
  return (COMMITTENTI_CENSIMENTO as readonly string[]).includes(c)
    ? (c as CommittenteCensimento)
    : null;
}
