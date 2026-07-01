// PURA: prepara le righe del master snapshot per l'upsert su acea_master_snapshot (chiave `odl`).
// Le saracinesche ZAGAROLO hanno ORDINE padre "DA CHIEDERE" (limitazione fatta ma non ancora ordinata
// ad ACEA) + un Odl saracinesca figlio (ODL reale, già consuntivato sul portale): usiamo l'Odl figlio
// come chiave `odl`, altrimenti la dedup per ODL le collassa tutte in una (odl="DA CHIEDERE").
import { voceDaAttivita } from '@/lib/produzione/voceDaAttivita';

export interface MasterSnapshotIn {
  odl?: string;
  attivita?: string;
  esecutore?: string;
  dataRaw?: string;
  statoRaw?: string;
  matricola?: string;
  comune?: string;
  esito?: string;
  saracinesca?: string;
  odlSaracinesca?: string;
}

export interface MasterRigaDb {
  odl: string;
  attivita: string | null;
  voce: number | null;
  esecutore: string | null;
  data_raw: string | null;
  stato_op: string | null;
  matricola: string | null;
  comune: string | null;
  esito: string | null;
  saracinesca: string | null;
  odl_saracinesca: string | null;
}

export function preparaRigheMasterSnapshot(snapshot: MasterSnapshotIn[]): MasterRigaDb[] {
  const seen = new Set<string>();
  const out: MasterRigaDb[] = [];
  for (const x of snapshot ?? []) {
    const odlSar = (x.odlSaracinesca ?? '').trim();
    const odlRaw = typeof x.odl === 'string' ? x.odl.trim() : '';
    const mat = (x.matricola ?? '').trim();
    // Chiave: Odl saracinesca figlio > ODL vero (numerico) > MAT:matricola. Le righe ZAGAROLO senza
    // ordine vero (vuoto = manuali dal campo, "DA CHIEDERE"/"DA RICHIEDERE" = non ancora ordinate)
    // usano la matricola (sempre presente, univoca) così non collassano e vengono valorizzate.
    const odl = odlSar || (/^\d+$/.test(odlRaw) ? odlRaw : mat ? `MAT:${mat}` : odlRaw);
    if (!odl) continue;
    if (seen.has(odl)) continue;
    seen.add(odl);
    out.push({
      odl,
      attivita: x.attivita ?? null,
      voce: voceDaAttivita(x.attivita ?? null),
      esecutore: x.esecutore ?? null,
      data_raw: x.dataRaw ?? null,
      stato_op: x.statoRaw ?? null,
      matricola: x.matricola ?? null,
      comune: x.comune ?? null,
      esito: x.esito ?? null,
      saracinesca: x.saracinesca ?? null,
      odl_saracinesca: odlSar || null,
    });
  }
  return out;
}
