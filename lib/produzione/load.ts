import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { esitoOkDaIntervento } from '@/lib/limitazione/exportLimMassive';
import { voceDaAttivita } from './voceDaAttivita';
import { normalizzaAttivita } from './normalizzaAttivita';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';
import { aggregaProduzione, type ProduzioneAggregata, type RigaProduzione } from './aggregaProduzione';
import {
  riconcilia,
  scartoProduzioneSal,
  type ClasseDiscrepanza,
  type Discrepanza,
  type DbRiga,
  type MasterRiga,
  type PortaleRiga,
  type Totale,
} from './riconciliazione';

// Loader server-only della "Produzione economica" ACEA. Riusa la logica pura testata.
// Condiviso tra l'endpoint dati (tab) e l'export Excel (così non si duplica il calcolo).

const PAGE = 1000;
const VOCI_VALIDE = new Set([10, 11, 12, 6]);
const KPI_DA_VOCE: Record<number, string> = { 10: 'EL', 11: 'ES', 12: 'ERC', 6: 'ERA' };
const AUDIT_CAP = 500;
const SARA_KEY = 'SOSTITUZIONE SARACINESCA';
const SARA_LABEL = 'Sostituzione saracinesca';

/** 'YYYY-MM-DD' da un testo data grezzo ("2026-06-03 00:00:00" o "03/06/2026"); null se non parsabile. */
function dataDaRaw(raw: string | null): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Voce affidabile: usa interventi.voce solo se valida, altrimenti la deriva dal testo attività. */
function risolviVoce(voceRaw: number | null, attivita: string | null): number | null {
  if (voceRaw != null && VOCI_VALIDE.has(voceRaw)) return voceRaw;
  return voceDaAttivita(attivita);
}

export interface ProduzioneSal {
  totale: Totale;
  perVoce: { chiave: string; label: string; conteggio: number; valore: number }[];
}

export interface ProduzioneEconomica {
  from: string;
  to: string;
  listino: ListinoRiga[];
  produzione: ProduzioneAggregata;
  sal: ProduzioneSal;
  scarto: Totale;
  audit: Discrepanza[];
  auditSummary: Record<ClasseDiscrepanza, number>;
  auditTotale: number;
  auditTruncated: boolean;
  masterPopolato: boolean;
  portalePopolato: boolean;
}

interface InterventoRow {
  id: string;
  odl: string | null;
  data: string | null;
  staff_id: string | null;
  territorio_id: string | null;
  voce: number | null;
  intervento_tipo: string | null;
  esito: string | null;
  stato: string | null;
}
interface MasterRow {
  odl: string;
  voce: number | null;
  attivita: string | null;
  esito: string | null;
  saracinesca: string | null;
  odl_saracinesca: string | null;
  esecutore: string | null;
  data_raw: string | null;
  comune: string | null;
}
interface PortaleRow {
  odl: string;
  stato_norm: string | null;
}

// Committenti inclusi nella Produzione economica ACEA: il DUNNING (committente='acea') e le
// limitazioni massive ZAGAROLO (committente='lim_massive'), valorizzate con lo stesso listino.
const COMMITTENTI = ['acea', 'lim_massive'];

async function caricaInterventiAcea(): Promise<InterventoRow[]> {
  const rows: InterventoRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, staff_id, territorio_id, voce, intervento_tipo, esito, stato')
      .in('committente', COMMITTENTI)
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as InterventoRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function caricaSnapshot<T>(tabella: string, colonne: string): Promise<T[]> {
  const rows: T[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(tabella)
      .select(colonne)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function nomi(): Promise<{ staff: Map<string, string>; terr: Map<string, string> }> {
  const [{ data: s }, { data: t }] = await Promise.all([
    supabaseAdmin.from('staff').select('id, display_name'),
    supabaseAdmin.from('territories').select('id, name'),
  ]);
  const staff = new Map<string, string>();
  for (const r of (s ?? []) as Array<{ id: string; display_name: string | null }>) {
    staff.set(r.id, (r.display_name ?? '').trim() || 'Operatore');
  }
  const terr = new Map<string, string>();
  for (const r of (t ?? []) as Array<{ id: string; name: string | null }>) {
    terr.set(r.id, (r.name ?? '').trim() || 'Territorio');
  }
  return { staff, terr };
}

export async function caricaProduzioneEconomica(from: string, to: string): Promise<ProduzioneEconomica> {
  const [listinoRows, interventi, masterRows, portaleRows, maps] = await Promise.all([
    supabaseAdmin
      .from('acea_listino')
      .select('id, attivita, prezzo, valido_dal, valido_al, attivo')
      .eq('committente', 'acea'),
    caricaInterventiAcea(),
    caricaSnapshot<MasterRow>('acea_master_snapshot', 'odl, voce, attivita, esito, saracinesca, odl_saracinesca, esecutore, data_raw, comune'),
    caricaSnapshot<PortaleRow>('acea_portale_snapshot', 'odl, stato_norm'),
    nomi(),
  ]);

  const listino: ListinoRiga[] = ((listinoRows.data ?? []) as Array<{
    id: string;
    attivita: string | null;
    prezzo: number;
    valido_dal: string;
    valido_al: string | null;
    attivo: boolean;
  }>)
    .filter((r) => r.attivita)
    .map((r) => ({
      id: r.id,
      attivita: r.attivita as string,
      prezzo: Number(r.prezzo),
      valido_dal: r.valido_dal,
      valido_al: r.valido_al,
      attivo: r.attivo,
    }));

  const valore = (attivitaKey: string, data: string): number => {
    if (!attivitaKey) return 0;
    const sel = prezzoPerData(listino, attivitaKey, data);
    return sel ? valoreRiga(sel.prezzo) : 0;
  };

  // DB per ODL: audit (vince il positivo) + info per attribuire la saracinesca al giusto operatore/giorno.
  const dbAudit = new Map<string, DbRiga>();
  const dbDataByOdl = new Map<string, string>();
  const dbAttivita = new Map<string, string>(); // odl → attività (per valorizzare il SAL)
  const dbInfo = new Map<string, { staffId: string; operatore: string; territorioId: string; territorio: string; data: string }>();
  const produzioneRighe: RigaProduzione[] = [];
  for (const it of interventi) {
    const odl = (it.odl ?? '').trim();
    const voce = risolviVoce(it.voce, it.intervento_tipo);
    const att = normalizzaAttivita(it.intervento_tipo);
    const attivitaKey = att?.key ?? '';
    const esitoOk = esitoOkDaIntervento(it.stato, it.esito);
    const data = (it.data ?? '').slice(0, 10);
    const staffId = it.staff_id ?? '';
    const operatore = (it.staff_id && maps.staff.get(it.staff_id)) || 'Sconosciuto';
    const territorioId = it.territorio_id ?? '';
    const territorio = (it.territorio_id && maps.terr.get(it.territorio_id)) || 'Senza territorio';
    if (odl) {
      const prev = dbAudit.get(odl);
      if (!prev || (esitoOk === true && prev.esitoOk !== true)) {
        dbAudit.set(odl, { voce, esitoOk });
        if (data) dbDataByOdl.set(odl, data);
        if (attivitaKey) dbAttivita.set(odl, attivitaKey);
        dbInfo.set(odl, { staffId, operatore, territorioId, territorio, data });
      }
    }
    // Produzione = positivo nel range
    if (esitoOk === true && data && data >= from && data <= to) {
      produzioneRighe.push({
        odl, voce, kpi: voce != null ? KPI_DA_VOCE[voce] ?? null : null,
        attivitaKey, attivitaLabel: att?.etichetta ?? '(senza attività)',
        data, staffId, operatore, territorioId, territorio,
        valore: valore(attivitaKey, data),
      });
    }
  }

  // master per ODL (voce + attività) + PRODUZIONE "Sostituzione saracinesca" (voce a sé dal master ZAGAROLO).
  const masterAudit = new Map<string, MasterRiga>();
  const masterAttivita = new Map<string, string>();
  const saracinesca: Array<{ odlFiglio: string; data: string }> = [];
  for (const m of masterRows) {
    const odl = (m.odl ?? '').trim();
    if (!odl) continue;
    masterAudit.set(odl, { voce: risolviVoce(m.voce, m.attivita) });
    const attK = normalizzaAttivita(m.attivita)?.key;
    if (attK) masterAttivita.set(odl, attK);
    // saracinesca=SI + esito=eseguito → voce "Sostituzione saracinesca", IN AGGIUNTA alla limitazione padre
    if ((m.saracinesca ?? '').trim().toUpperCase() === 'SI' && (m.esito ?? '').trim().toLowerCase() === 'eseguito') {
      const info = dbInfo.get(odl);
      const data = info?.data ?? dataDaRaw(m.data_raw) ?? '';
      saracinesca.push({ odlFiglio: (m.odl_saracinesca ?? '').trim(), data });
      if (data && data >= from && data <= to) {
        produzioneRighe.push({
          odl, voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL, data,
          staffId: info?.staffId ?? '',
          operatore: info?.operatore ?? ((m.esecutore ?? '').trim() || 'Sconosciuto'),
          territorioId: info?.territorioId ?? '',
          territorio: info?.territorio ?? ((m.comune ?? '').trim() || 'Senza territorio'),
          valore: valore(SARA_KEY, data),
        });
      }
    }
  }
  const produzione = aggregaProduzione(produzioneRighe);

  // portale per ODL + SAL (limitazioni per ODL + saracinesca per Odl figlio).
  const portaleAudit = new Map<string, PortaleRiga>();
  const salRighe: RigaProduzione[] = [];
  for (const p of portaleRows) {
    const odl = (p.odl ?? '').trim();
    if (!odl) continue;
    const statoNorm = (p.stato_norm ?? '').trim();
    portaleAudit.set(odl, { statoNorm });
    if (statoNorm === 'COMPLETATO') {
      const voce = dbAudit.get(odl)?.voce ?? masterAudit.get(odl)?.voce ?? null;
      const attivitaKey = dbAttivita.get(odl) ?? masterAttivita.get(odl) ?? '';
      const data = dbDataByOdl.get(odl) ?? to;
      salRighe.push({
        odl, voce, kpi: voce != null ? KPI_DA_VOCE[voce] ?? null : null,
        attivitaKey, attivitaLabel: attivitaKey, data,
        staffId: '', operatore: '', territorioId: '', territorio: '',
        valore: valore(attivitaKey, data),
      });
    }
  }
  // SAL saracinesca: l'Odl saracinesca (figlio) COMPLETATO sul portale.
  for (const s of saracinesca) {
    if (s.odlFiglio && portaleAudit.get(s.odlFiglio)?.statoNorm === 'COMPLETATO') {
      const data = s.data || to;
      salRighe.push({
        odl: s.odlFiglio, voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL, data,
        staffId: '', operatore: '', territorioId: '', territorio: '',
        valore: valore(SARA_KEY, data),
      });
    }
  }
  const salAgg = aggregaProduzione(salRighe);
  const sal: ProduzioneSal = { totale: salAgg.totale, perVoce: salAgg.perVoce };

  const scarto = scartoProduzioneSal(produzione.totale, sal.totale);

  const masterPopolato = masterAudit.size > 0;
  const portalePopolato = portaleAudit.size > 0;
  const auditTutte = riconcilia(
    { db: dbAudit, master: masterAudit, portale: portaleAudit },
    { masterPopolato, portalePopolato },
  );
  const auditSummary: Record<ClasseDiscrepanza, number> = {
    SOLO_PORTALE: 0,
    DB_NON_IN_MASTER: 0,
    MASTER_NON_IN_DB: 0,
    POSITIVO_DB_NON_COMPLETATO_PORTALE: 0,
    COMPLETATO_PORTALE_NON_POSITIVO_DB: 0,
    VOCE_DISCORDE: 0,
    VOCE_NON_RISOLTA: 0,
  };
  for (const d of auditTutte) auditSummary[d.classe] += 1;

  return {
    from,
    to,
    listino,
    produzione,
    sal,
    scarto,
    audit: auditTutte.slice(0, AUDIT_CAP),
    auditSummary,
    auditTotale: auditTutte.length,
    auditTruncated: auditTutte.length > AUDIT_CAP,
    masterPopolato,
    portalePopolato,
  };
}
