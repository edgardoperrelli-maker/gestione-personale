// PURA: il rapportino è inviabile solo se nessuna voce è in attesa di approvazione.
export type VoceApprovazione = { approvazione_stato: string | null };

export function rapportinoInviabile(
  voci: VoceApprovazione[],
): { inviabile: boolean; inSospeso: number } {
  const inSospeso = voci.filter((v) => v.approvazione_stato === 'in_attesa').length;
  return { inviabile: inSospeso === 0, inSospeso };
}
