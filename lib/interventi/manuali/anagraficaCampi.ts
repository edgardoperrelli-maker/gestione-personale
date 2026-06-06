// PURA: lista ordinata dei campi anagrafica da mostrare nella modale manuale.
// Delega a resolveInfoCampi (gestisce default 11 storici, alias, ordine, etichette).
import { resolveInfoCampi, type TemplateInfoCampo } from '@/utils/rapportini/infoCampi';

export function anagraficaCampi(
  snapshot: TemplateInfoCampo[] | null | undefined,
): TemplateInfoCampo[] {
  return resolveInfoCampi(snapshot);
}
