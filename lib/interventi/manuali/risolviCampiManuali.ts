// PURA: eredità campi del "+" — l'override (template solo_manuale) vince se valorizzato,
// altrimenti si eredita lo standard (template del rapportino). Stessa logica del client.
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export function risolviCampiManuali(
  override: TemplateCampo[] | null | undefined,
  standard: TemplateCampo[] | null | undefined,
): TemplateCampo[] {
  return override && override.length > 0 ? override : (standard ?? []);
}
