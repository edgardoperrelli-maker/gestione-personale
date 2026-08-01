import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildTassonomiaIndex, type TassonomiaRiga } from './tassonomia';
import { costruisciMasterOdl, type FonteMaster, type FonteMasterRiga, type RigaMasterOdl } from './masterOdl';

const PAGE = 1000;

type RigaMasterDb = { odl: string | null; matricola: string | null; impianto: string | null; indirizzo: string | null; cap: string | null; comune: string | null; operazione: string | null };
type RigaSnapshotDb = { odl: string | null; attivita: string | null; matricola: string | null; comune: string | null; indirizzo?: string | null };
type RigaOrdineDb = { odl: string | null; attivita: string | null; matricola: string | null; impianto: string | null; via: string | null; civico: string | null; cap: string | null; comune: string | null };

async function righeMasterCaricato(masterId: string): Promise<FonteMasterRiga[]> {
  const righe: FonteMasterRiga[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('template_master_righe')
      .select('odl, matricola, impianto, indirizzo, cap, comune, operazione')
      .eq('master_id', masterId)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as RigaMasterDb[];
    righe.push(...batch);
    if (batch.length < PAGE) break;
  }
  return righe;
}

/** Registro ACEA (`acea_ordini`, specchio dell'export del Cruscotto): il DUNNING è GIÀ nel
 *  DB via modulo ACEA, senza passare dall'agente. La chiave lì è (odl, numero_operazione):
 *  l'ordinamento mette prima l'operazione APERTA, così la dedup per ODL a valle tiene quella. */
async function righeRegistroAcea(): Promise<RigaOrdineDb[]> {
  const righe: RigaOrdineDb[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl, attivita, matricola, impianto, via, civico, cap, comune')
      .order('odl', { ascending: true })
      .order('aperto', { ascending: false })
      .order('numero_operazione', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as RigaOrdineDb[];
    righe.push(...batch);
    if (batch.length < PAGE) break;
  }
  return righe;
}

async function righeSnapshot(conIndirizzo: boolean): Promise<RigaSnapshotDb[]> {
  const colonne = conIndirizzo ? 'odl, attivita, matricola, comune, indirizzo' : 'odl, attivita, matricola, comune';
  const righe: RigaSnapshotDb[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('acea_master_snapshot')
      .select(colonne)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as RigaSnapshotDb[];
    righe.push(...batch);
    if (batch.length < PAGE) break;
  }
  return righe;
}

/**
 * Le fonti del foglio MasterODL del template di import, già fuse e canonicalizzate:
 * 1) i file master caricati a mano (SOLO attivi: lo "spegnimento" è il toggle admin);
 * 2) il registro ACEA (`acea_ordini`, dunning+massive importati dal modulo ACEA);
 * 3) lo snapshot del master che l'agente invia — ultima riserva per gli ambienti dove
 *    il registro non c'è. La fusione deduplica per ODL: nessun doppione per costruzione.
 * BEST-EFFORT: ogni fonte che non risponde (tabella non ancora migrata, colonna
 * indirizzo assente) viene loggata e saltata — il download del template non si rompe mai,
 * al peggio esce senza autocompilazione.
 */
export async function caricaMasterOdl(tassonomia: TassonomiaRiga[]): Promise<RigaMasterOdl[]> {
  const fonti: FonteMaster[] = [];

  try {
    const { data: files, error } = await supabaseAdmin
      .from('template_master')
      .select('id, committente, gruppi_default')
      .eq('attivo', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    for (const f of (files ?? []) as Array<{ id: string; committente: string; gruppi_default: string[] | null }>) {
      fonti.push({
        committente: f.committente,
        gruppiDefault: f.gruppi_default,
        righe: await righeMasterCaricato(f.id),
      });
    }
  } catch (e) {
    console.error('[template] master caricati non disponibili:', e instanceof Error ? e.message : e);
  }

  try {
    const t = (v: string | null) => String(v ?? '').trim();
    fonti.push({
      committente: 'acea',
      righe: (await righeRegistroAcea()).map((r) => ({
        odl: r.odl,
        operazione: r.attivita,
        matricola: r.matricola,
        impianto: r.impianto,
        indirizzo: [t(r.via), t(r.civico)].filter(Boolean).join(' '),
        cap: r.cap,
        comune: r.comune,
      })),
    });
  } catch (e) {
    console.error('[template] registro ACEA non disponibile:', e instanceof Error ? e.message : e);
  }

  try {
    let righe: RigaSnapshotDb[];
    try {
      righe = await righeSnapshot(true);
    } catch {
      // colonna indirizzo non ancora migrata → si riprova senza (autocompila il resto)
      righe = await righeSnapshot(false);
    }
    fonti.push({
      committente: 'acea',
      righe: righe.map((r) => ({
        odl: r.odl,
        operazione: r.attivita,
        matricola: r.matricola,
        indirizzo: r.indirizzo ?? '',
        comune: r.comune,
      })),
    });
  } catch (e) {
    console.error('[template] snapshot master non disponibile:', e instanceof Error ? e.message : e);
  }

  return costruisciMasterOdl(fonti, buildTassonomiaIndex(tassonomia));
}
