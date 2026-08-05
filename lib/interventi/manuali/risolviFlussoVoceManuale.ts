// PURA: il flusso (template) dedicato del GRUPPO ATTIVITÀ di una voce nata dal "+" operatore,
// dato SOLO committente e gruppo — mai il territorio. Estratta da app/api/r/[token]/
// intervento-manuale/route.ts e app/api/admin/interventi-manuali/[id]/approva/route.ts, che la
// usano rispettivamente alla creazione del "+" e, quando ancora manca un intervento da cui
// risolvere, alla sua approvazione.
//
// PERCHÉ MAI IL TERRITORIO: il territorio è un marcatore GEOGRAFICO del piano/operatore, e nella
// gerarchia ATLAS uno stesso territorio ospita più committenti insieme (es. il territorio ACEA
// copre acea, lim_massive e italgas). Sceglierlo come criterio del flusso — invece del committente
// scelto nel modulo del "+" — sbaglierebbe modulo ogni volta che due committenti condividono la
// stessa zona: è la stessa ragione per cui `risolviFlussoPerGruppo` non prende in input il
// territorio, e questa funzione lo rispetta non accettandolo nemmeno come parametro.
import { risolviFlussoPerGruppo, templateCollegato, type TemplateFlussoRow } from '@/lib/rapportini/flussiGruppo';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { FotoIdCampo } from './fotoNaming';

export type FlussoRowManuale = TemplateFlussoRow & {
  id: string;
  nome?: string | null;
  campi: TemplateCampo[] | null;
  foto_id_priority?: string[] | null;
};

export type FlussoVoceManuale = {
  templateId: string;
  campi: TemplateCampo[];
  fotoIdPriority: FotoIdCampo[];
};

/**
 * Risolve il flusso dedicato del (committente, gruppo attività) di una voce manuale.
 * NULL = nessun flusso collegato a quel gruppo: il chiamante eredita — come sempre — lo standard
 * del rapportino (comportamento voluto quando il gruppo non ha un modulo proprio, es. AcquaLatina).
 */
export function risolviFlussoVoceManuale<T extends FlussoRowManuale>(
  committente: string | null | undefined,
  gruppo: string | null | undefined,
  flussi: T[],
): FlussoVoceManuale | null {
  const flusso = risolviFlussoPerGruppo(
    committenteEquivalente(committente),
    gruppo,
    flussi.filter((f) => templateCollegato(f)),
  );
  if (!flusso || !Array.isArray(flusso.campi) || flusso.campi.length === 0) return null;
  return {
    templateId: flusso.id,
    campi: flusso.campi as TemplateCampo[],
    fotoIdPriority: (flusso.foto_id_priority ?? []) as FotoIdCampo[],
  };
}
