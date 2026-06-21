// lib/agente/assegnabiliAcea.ts
// PURO: dagli interventi ACEA del giorno costruisce la lista (odl→operatore) da spingere su ACEA,
// scartando odl mancanti, operatori non risolti e odl già assegnati (idempotenza).
export type InterventoAcea = { id: string; odl: string | null; matricola_contatore: string | null; indirizzo: string | null; comune: string | null; staff_id: string | null };
export type RigaAssegnabile = { interventoId: string; odl: string; matricola: string; indirizzo: string; comune: string; staffId: string; operatoreAcea: string };

const t = (v: string | null | undefined): string => (v ?? '').trim();

export function assegnabiliAcea(
  interventi: InterventoAcea[],
  staffById: Record<string, string>,
  odlGiaAssegnati: Set<string>,
): { righe: RigaAssegnabile[]; scartati: { odl: string | null; motivo: string }[] } {
  const righe: RigaAssegnabile[] = [];
  const scartati: { odl: string | null; motivo: string }[] = [];
  for (const i of interventi ?? []) {
    const odl = t(i.odl);
    if (!odl) { scartati.push({ odl: i.odl ?? '', motivo: 'odl mancante' }); continue; }
    const staffId = t(i.staff_id);
    const nome = staffId ? staffById[staffId] : undefined;
    if (!nome) { scartati.push({ odl, motivo: 'operatore non risolto' }); continue; }
    if (odlGiaAssegnati.has(odl)) { scartati.push({ odl, motivo: 'già assegnato' }); continue; }
    righe.push({ interventoId: i.id, odl, matricola: t(i.matricola_contatore), indirizzo: t(i.indirizzo), comune: t(i.comune), staffId, operatoreAcea: nome });
  }
  return { righe, scartati };
}
