import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { esitoOkDaIntervento } from '@/lib/limitazione/exportLimMassive';
import { voceDaAttivita } from './voceDaAttivita';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';
import { attivitaCanonica } from './attivitaCanonica';
import { dataDaRaw } from './dataDaRaw';
import { scostamentoPagato } from './statoPortale';
import { caricaAliasAttivita } from './aliasAttivita';
import { aggregaProduzione, deduplicaMassivePerMatricola, type ProduzioneAggregata, type RigaProduzione } from './aggregaProduzione';
import { aggregaPersonale, type ProduzionePersonale, type RigaLavoro } from './aggregaPersonale';
import type { InterventoNonClassificato } from './nonClassificate';
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

/** Voce affidabile: usa interventi.voce solo se valida, altrimenti la deriva dal testo attività. */
function risolviVoce(voceRaw: number | null, attivita: string | null): number | null {
  if (voceRaw != null && VOCI_VALIDE.has(voceRaw)) return voceRaw;
  return voceDaAttivita(attivita);
}

export interface ProduzioneSal {
  totale: Totale;
  perVoce: { chiave: string; label: string; conteggio: number; valore: number }[];
  perGiorno: { chiave: string; label: string; conteggio: number; valore: number }[];
}

export interface ProduzioneEconomica {
  from: string;
  to: string;
  listino: ListinoRiga[];
  produzione: ProduzioneAggregata;
  sal: ProduzioneSal;
  scarto: Totale;
  personale: ProduzionePersonale;
  nonClassificate: InterventoNonClassificato[];
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
  committente: string | null;
  comune: string | null;
  matricola_contatore: string | null;
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
  causa_scostamento: string | null;
}
interface LavoroRow {
  staff_id: string | null;
  data: string | null;
  committente: string | null;
  intervento_tipo: string | null;
  comune: string | null;
}

// Committenti inclusi nella Produzione economica ACEA: il DUNNING (committente='acea') e le
// limitazioni massive ZAGAROLO (committente='lim_massive'), valorizzate con lo stesso listino.
const COMMITTENTI = ['acea', 'lim_massive'];

async function caricaInterventiAcea(): Promise<InterventoRow[]> {
  const rows: InterventoRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, staff_id, territorio_id, voce, intervento_tipo, esito, stato, committente, comune, matricola_contatore')
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

/** Giorno successivo di 'YYYY-MM-DD' (bound esclusivo per query robuste a date/timestamp). */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Interventi LAVORATI (stato='completato', qualsiasi committente) nel range: è il DENOMINATORE
// delle giornate-uomo frazionarie (un operatore "doppio territorio" che fa ACEA a saturazione
// non conta una giornata intera sulla commessa).
async function caricaLavoroGiornaliero(from: string, to: string): Promise<LavoroRow[]> {
  const rows: LavoroRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('staff_id, data, committente, intervento_tipo, comune')
      .eq('stato', 'completato')
      .gte('data', from)
      .lt('data', giornoDopo(to))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as LavoroRow[];
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
  const [listinoRows, interventi, masterRows, portaleRows, maps, alias, lavoroRows] = await Promise.all([
    supabaseAdmin
      .from('acea_listino')
      .select('id, attivita, prezzo, valido_dal, valido_al, attivo')
      .eq('committente', 'acea'),
    caricaInterventiAcea(),
    caricaSnapshot<MasterRow>('acea_master_snapshot', 'odl, voce, attivita, esito, saracinesca, odl_saracinesca, esecutore, data_raw, comune'),
    caricaSnapshot<PortaleRow>('acea_portale_snapshot', 'odl, stato_norm, causa_scostamento'),
    nomi(),
    caricaAliasAttivita(),
    caricaLavoroGiornaliero(from, to),
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
  const effByOdl = new Map<string, string>(); // odl → committente EFFETTIVO (per escludere il gas dal SAL)
  const produzioneRighe: RigaProduzione[] = [];
  const nonClassificate: InterventoNonClassificato[] = [];
  for (const it of interventi) {
    const odl = (it.odl ?? '').trim();
    // attività CANONICA via alias (+ regole comune per le righe senza attività) → committente effettivo,
    // attività pulita e voce. La riclassificazione (gas→italgas, massive→acea) vive qui, non nel DB.
    const canon = attivitaCanonica(it.committente, it.intervento_tipo, it.comune, alias);
    if (odl && canon) effByOdl.set(odl, canon.committenteEff);
    // Produzione economica ACEA: solo committente effettivo 'acea' e attività non scartata.
    if (!canon || !canon.attivo || canon.committenteEff !== 'acea') continue;
    const voce = canon.voce;
    const attivitaKey = canon.attivitaKey;
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
        attivitaKey, attivitaLabel: canon.attivitaPulita, matricola: it.matricola_contatore ?? '',
        data, staffId, operatore, territorioId, territorio,
        valore: valore(attivitaKey, data),
      });
      // "Non classificata" (dettaglio riga): voce non derivata dal testo attività. Il testo GREZZO
      // (non canon.attivitaPulita, che nel caso alias è la stessa etichetta condivisa da più causali
      // diverse) serve a chi deve riassociare correttamente l'intervento alla voce KPI corretta.
      if (voce == null) {
        nonClassificate.push({
          odl, data, operatore, territorio,
          committente: (it.committente ?? '').trim(),
          comune: (it.comune ?? '').trim(),
          descrizioneGrezza: (it.intervento_tipo ?? '').trim(),
          attivitaCanonica: canon.attivitaPulita,
          valore: valore(attivitaKey, data),
        });
      }
    }
  }

  // master per ODL (voce + attività) + PRODUZIONE "Sostituzione saracinesca" (voce a sé dal master ZAGAROLO).
  const masterAudit = new Map<string, MasterRiga>();
  const masterAttivita = new Map<string, string>();
  const saracinesca: Array<{ odlFiglio: string; data: string }> = [];
  for (const m of masterRows) {
    const odl = (m.odl ?? '').trim();
    if (!odl) continue;
    // Le chiavi per-matricola (prefisso "MAT:") sono righe ZAGAROLO senza ODL reale (manuali dal campo,
    // "DA CHIEDERE"): valgono per la PRODUZIONE saracinesca ma NON per audit/SAL (non hanno un ODL sul
    // portale, altrimenti gonfierebbero le discrepanze come "master non nel portale").
    const odlReale = !odl.startsWith('MAT:');
    if (odlReale) {
      masterAudit.set(odl, { voce: risolviVoce(m.voce, m.attivita) });
      // Attività CANONICA (via alias) anche per il master: la chiave GREZZA non aggancia il listino
      // (es. "LIMITAZIONE FLUSSO IDRICO" ≠ tariffa "LIMITAZIONE EROGAZIONE") → altrimenti SAL a 0.
      const canonM = attivitaCanonica('acea', m.attivita, m.comune, alias);
      if (canonM?.attivitaKey) masterAttivita.set(odl, canonM.attivitaKey);
    }
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
  // Produzione: le limitazioni massive contano per MATRICOLA (non per riga-intervento), come ACEA.
  const produzione = aggregaProduzione(deduplicaMassivePerMatricola(produzioneRighe));

  // Odl figli saracinesca → data del padre: valorizzano la "Sostituzione saracinesca" nel SAL
  // quando l'Odl figlio risulta COMPLETATO sul portale (Fix B, niente riga fantasma a 0).
  const saracinescaByFiglio = new Map<string, string>();
  for (const s of saracinesca) if (s.odlFiglio) saracinescaByFiglio.set(s.odlFiglio, s.data);

  // portale per ODL + SAL (limitazioni per ODL + saracinesca per Odl figlio).
  const portaleAudit = new Map<string, PortaleRiga>();
  const salRighe: RigaProduzione[] = [];
  for (const p of portaleRows) {
    const odl = (p.odl ?? '').trim();
    if (!odl) continue;
    // il gas riclassificato (committente effettivo italgas) è fuori dalla vista ACEA (audit + SAL)
    if (effByOdl.get(odl) === 'italgas') continue;
    const statoNorm = (p.stato_norm ?? '').trim();
    portaleAudit.set(odl, { statoNorm });
    // SAL = ciò che ACEA REMUNERA: solo COMPLETATO con causa scostamento pagata (inizia per E).
    // L'audit (portaleAudit) resta su tutti i COMPLETATO; qui filtriamo solo il valorizzato.
    if (statoNorm === 'COMPLETATO' && scostamentoPagato(p.causa_scostamento)) {
      if (saracinescaByFiglio.has(odl)) {
        // Odl figlio di una saracinesca consuntivato → vale la Sostituzione saracinesca (91,12),
        // non una limitazione con attività vuota. Evita la riga fantasma a 0 (niente doppio conteggio).
        const data = saracinescaByFiglio.get(odl) || to;
        salRighe.push({
          odl, voce: null, kpi: null, attivitaKey: SARA_KEY, attivitaLabel: SARA_LABEL, data,
          staffId: '', operatore: '', territorioId: '', territorio: '',
          valore: valore(SARA_KEY, data),
        });
      } else {
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
  }
  const salAgg = aggregaProduzione(salRighe);
  const sal: ProduzioneSal = { totale: salAgg.totale, perVoce: salAgg.perVoce, perGiorno: salAgg.perGiorno };

  const scarto = scartoProduzioneSal(produzione.totale, sal.totale);

  // Giornate-uomo: frazione ACEA/totale per (operatore, giorno). ACEA = committente EFFETTIVO
  // 'acea' via alias (stessa riclassificazione della produzione: il gas→italgas resta fuori).
  const righeLavoro: RigaLavoro[] = [];
  for (const l of lavoroRows) {
    const staffId = l.staff_id ?? '';
    const data = (l.data ?? '').slice(0, 10);
    if (!staffId || !data) continue;
    const canon = COMMITTENTI.includes(l.committente ?? '')
      ? attivitaCanonica(l.committente, l.intervento_tipo, l.comune, alias)
      : null;
    righeLavoro.push({
      staffId,
      operatore: maps.staff.get(staffId) ?? 'Operatore',
      data,
      acea: canon?.committenteEff === 'acea',
    });
  }
  const personale = aggregaPersonale(righeLavoro, produzione.perOperatore);

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
    personale,
    nonClassificate,
    audit: auditTutte.slice(0, AUDIT_CAP),
    auditSummary,
    auditTotale: auditTutte.length,
    auditTruncated: auditTutte.length > AUDIT_CAP,
    masterPopolato,
    portalePopolato,
  };
}
