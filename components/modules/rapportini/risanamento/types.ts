/** Riga-misuratore (figlia di una voce-civico) come arriva dal server. */
export type RigaRisanamento = {
  id: string;
  voce_id: string;
  matricola: string | null;
  pdr: string | null;
  nominativo: string | null;
  risposte: Record<string, unknown> | null;
  ordine: number;
  fonte: string;
};
