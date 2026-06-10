export type MisuratorePdf = { matricola: string; pdr: string; nominativo: string };
export type CivicoPdf = { via: string; comune: string; misuratori: MisuratorePdf[] };
export type DatiPdfRisanamento = { civici: CivicoPdf[]; totaleMisuratori: number; totaleCivici: number };

type VoceIn = { id: string; via?: string | null; comune?: string | null };
type RigaIn = { voce_id: string; matricola?: string | null; pdr?: string | null; nominativo?: string | null; ordine?: number | null };

/** Raggruppa le righe-misuratore per civico (voce), ordinate per `ordine`. Nessuna foto. */
export function datiPdfRisanamento(voci: VoceIn[], righe: RigaIn[]): DatiPdfRisanamento {
  const civici: CivicoPdf[] = voci.map((v) => {
    const misuratori = righe
      .filter((r) => r.voce_id === v.id)
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))
      .map((r) => ({ matricola: r.matricola ?? '', pdr: r.pdr ?? '', nominativo: r.nominativo ?? '' }));
    return { via: v.via ?? '', comune: v.comune ?? '', misuratori };
  });
  return { civici, totaleMisuratori: righe.length, totaleCivici: voci.length };
}
