// PURA: validazione dello spostamento di un'attività in un altro GRUPPO.
// Il gruppo è l'unità con cui «Azioni operatori» assegna le azioni: due attività nello
// stesso gruppo condividono per forza lo stesso flusso (risolviFlussoPerGruppo). Finché il
// gruppo era scrivibile solo alla creazione, un'attività finita nel gruppo sbagliato non
// poteva più avere azioni proprie — era il caso di PICARRO dentro «P.I.» (Italgas).
//
// La DESCRIZIONE resta intoccabile (è la forma canonica referenziata dallo storico: si
// rinomina solo creando una voce nuova e disattivando la vecchia): qui cambia solo la
// classificazione. Convenzione gruppo = UPPERCASE, spazi collassati, come in POST.
export type SpostamentoGruppo = { id: string; gruppo: string };

export function validaSpostamentoGruppo(
  body: unknown,
): { ok: true; valore: SpostamentoGruppo } | { ok: false; errore: string } {
  if (typeof body !== 'object' || body == null) return { ok: false, errore: 'Body non valido.' };
  const b = body as Record<string, unknown>;
  const id = String(b.id ?? '').trim();
  if (!id) return { ok: false, errore: 'ID voce obbligatorio.' };
  if (typeof b.gruppo !== 'string') return { ok: false, errore: 'Gruppo attività obbligatorio.' };
  const gruppo = b.gruppo.replace(/\s+/g, ' ').trim().toUpperCase();
  if (!gruppo) return { ok: false, errore: 'Gruppo attività obbligatorio.' };
  return { ok: true, valore: { id, gruppo } };
}
