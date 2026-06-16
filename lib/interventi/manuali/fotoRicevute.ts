// PURA: estrazione delle foto ricevute dalla FormData e risoluzione etichetta slot.
// Serve al "mai scartare": il server salva OGNI parte foto:* ricevuta, anche slot
// non previsti dal template.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

/** Tutte le parti `foto:<chiave>` con un file non vuoto, indipendenti dal template. */
export function partiFotoRicevute(form: FormData): Array<{ chiave: string; file: File }> {
  const out: Array<{ chiave: string; file: File }> = [];
  for (const [key, value] of form.entries()) {
    const m = /^foto:(.+)$/.exec(key);
    if (!m) continue;
    if (typeof value === 'string') continue;
    const file = value as File;
    if (file.size > 0) out.push({ chiave: m[1], file });
  }
  return out;
}

/** Etichetta dello slot foto se la chiave combacia con un campo `tipo==='foto'`; altrimenti la chiave. */
export function etichettaSlotFoto(chiave: string, campi: TemplateCampo[]): string {
  const campo = (campi ?? []).find((c) => c.tipo === 'foto' && c.chiave === chiave);
  return campo?.etichetta ?? chiave;
}
