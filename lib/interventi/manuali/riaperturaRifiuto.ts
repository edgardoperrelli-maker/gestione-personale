// PURA: quali richieste manuali si possono riportare in coda con «Riapri».
//
// Serve perché il rifiuto è l'unica decisione dell'ufficio senza ritorno: la coda mostra solo
// le `in_attesa`, il registro è di sola lettura e `approva` ha un check-and-set su
// `stato='in_attesa'` che risponde 409 `gia_gestita`. Un click sbagliato su «Rifiuta» chiudeva
// quindi la pratica per sempre, e l'unica via d'uscita era rifare il "+" dal campo: rapportino
// riaperto, operatore di nuovo sul posto, foto rifatte. Per un errore di mouse in ufficio.
//
// SOLO `rifiutato`, e gli altri stati stanno fuori per un motivo, non per prudenza:
// - `approvato` / `auto_liberi`: l'intervento canonico ESISTE già. Tornare indietro vuol dire
//   cancellarlo, che è una decisione diversa (con la contabilità che ci pende) — nel P.I. la si
//   prende esplicitamente (`/api/admin/pi/interventi/[id]/riapri`), qui no.
// - `annullato`: l'annullamento dell'operatore CANCELLA la voce del rapportino
//   (`/api/r/[token]/intervento-manuale/[id]/annulla`). Riaprirlo lascerebbe una richiesta senza
//   voce, e approvarla creerebbe un intervento che nel rapportino di quel giorno non compare.
// - `in_attesa`: è già in coda. Non c'è niente da riaprire.
import type { StatoRichiesta } from './types';

export function riapribile(stato: StatoRichiesta | string | null | undefined): boolean {
  return stato === 'rifiutato';
}
