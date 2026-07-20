// PURA: validazione input per la UI tassonomia (spec fase 2 §4.1).
// La DESCRIZIONE è la forma canonica che finirà su interventi: trim + spazi collassati,
// case CONSERVATO (mai uppercase forzato). Il GRUPPO è uppercase per convenzione.
const COMMITTENTI = ['acea', 'italgas', 'altro'] as const;

export type InputTassonomia = { committente: string; descrizione: string; gruppo: string };

export function validaTassonomiaInput(
  body: unknown,
): { ok: true; valore: InputTassonomia } | { ok: false; errore: string } {
  if (typeof body !== 'object' || body == null) return { ok: false, errore: 'Body non valido.' };
  const b = body as Record<string, unknown>;
  const committente = String(b.committente ?? '').trim().toLowerCase();
  if (!(COMMITTENTI as readonly string[]).includes(committente)) {
    return { ok: false, errore: `committente non valido (${COMMITTENTI.join('|')}).` };
  }
  const descrizione = String(b.descrizione ?? '').replace(/\s+/g, ' ').trim();
  if (!descrizione) return { ok: false, errore: 'Descrizione attività obbligatoria.' };
  const gruppo = String(b.gruppo ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!gruppo) return { ok: false, errore: 'Gruppo attività obbligatorio.' };
  return { ok: true, valore: { committente, descrizione, gruppo } };
}
