// lib/interventi/storico/normalizza.ts
// PURA: normalizzazione righe rapportino_voci → RigaStorico, rese SI/NO, ordinamento.
import type { RigaStorico, VoceStoricoRow, RapportinoEmbed, ContatoriStorico } from './types';
import type { SiNoFiltro } from './filtri';

const SI = new Set(['si', 'sì', 'true', 'x', '1', 'vero', 'y', 'yes', '✓']);
const NO = new Set(['no', 'false', '0', 'falso', 'n']);

/** Normalizza un valore di risposta in 'SI' | 'NO' | '—' (valore inatteso → grezzo). */
export function siNo(value: unknown): string {
  if (value == null) return '—';
  const s = String(value).trim();
  if (s === '') return '—';
  const l = s.toLowerCase();
  if (SI.has(l)) return 'SI';
  if (NO.has(l)) return 'NO';
  return s;
}

function nz(v: unknown): string | null {
  const t = (v ?? '').toString().trim();
  return t === '' ? null : t;
}

/** L'embed rapportini è to-one (oggetto); gestiamo anche array per robustezza. */
function rappOf(r: RapportinoEmbed | RapportinoEmbed[] | null | undefined): RapportinoEmbed | null {
  if (!r) return null;
  return Array.isArray(r) ? (r[0] ?? null) : r;
}

export function voceToRigaStorico(row: VoceStoricoRow, staffById: Map<string, string>): RigaStorico {
  const r = (row.risposte ?? {}) as Record<string, unknown>;
  const rapp = rappOf(row.rapportini);
  const staffId = rapp?.staff_id ?? null;
  const miniBag = r['mini_bag'] ?? r['minibag'];
  const noteRaw = r['note'];
  return {
    id: row.id,
    odl: nz(row.odl),
    pdr: nz(row.pdr),
    matricola: nz(row.matricola),
    data: rapp?.data ?? null,
    esecutore: nz(rapp?.staff_name) ?? (staffId ? staffById.get(staffId) ?? null : null),
    via: nz(row.via),
    gruppoAttivita: nz(row.attivita),
    eseguito: siNo(r['eseguito']),
    sostValvola: siNo(r['sostituzione_valvola']),
    miniBag: siNo(miniBag),
    rgStop: siNo(r['rg_stop']),
    note: nz(typeof noteRaw === 'string' ? noteRaw : null),
  };
}

/** Riga grezza letta da `interventi` per le P.I. (origine='pronto_intervento'), che non
 *  hanno una voce di rapportino e quindi vanno incluse a parte nello storico. */
export type InterventoPiRow = {
  id: string;
  indirizzo: string | null;
  comune: string | null;
  data: string | null;
  staff_id: string | null;
  rif_esterno: string | null;
  intervento_tipo: string | null;
  esito: string | null;
  esito_motivo: string | null;
};

/** Mappa una riga `interventi` P.I. nel formato unificato dello storico. */
export function interventoPiToRigaStorico(row: InterventoPiRow, staffById: Map<string, string>): RigaStorico {
  return {
    id: row.id,
    odl: nz(row.rif_esterno),
    pdr: null,
    matricola: null,
    data: row.data ?? null,
    esecutore: row.staff_id ? staffById.get(row.staff_id) ?? null : null,
    via: nz(row.indirizzo),
    gruppoAttivita: nz(row.intervento_tipo) ?? 'PRONTO INTERVENTO',
    eseguito: row.esito === 'eseguito_positivo' ? 'SI' : siNo(row.esito),
    sostValvola: '—',
    miniBag: '—',
    rgStop: '—',
    note: nz(row.esito_motivo),
  };
}

/** Match SI/NO sul valore già normalizzato: 'NO' include anche '—' (non risulta SI). */
function matchSiNo(cell: string, filt: SiNoFiltro): boolean {
  if (!filt) return true;
  if (filt === 'SI') return cell === 'SI';
  return cell !== 'SI';
}

/** Filtra in memoria le righe per i campi a risposta SI/NO (eseguito, valvola, mini bag, rg stop). */
export function filtraSiNo(
  righe: RigaStorico[],
  f: { eseguito: SiNoFiltro; sostValvola: SiNoFiltro; miniBag: SiNoFiltro; rgStop: SiNoFiltro },
): RigaStorico[] {
  return righe.filter(
    (r) =>
      matchSiNo(r.eseguito, f.eseguito) &&
      matchSiNo(r.sostValvola, f.sostValvola) &&
      matchSiNo(r.miniBag, f.miniBag) &&
      matchSiNo(r.rgStop, f.rgStop),
  );
}

export function ordinaRighe(righe: RigaStorico[]): RigaStorico[] {
  return [...righe].sort((a, b) => {
    const da = a.data ?? '';
    const db = b.data ?? '';
    if (da !== db) return db.localeCompare(da); // data desc
    const va = (a.via ?? '').toLowerCase();
    const vb = (b.via ?? '').toLowerCase();
    if (va !== vb) return va.localeCompare(vb); // via asc
    return a.id.localeCompare(b.id); // tie-breaker deterministico
  });
}

/** Contatori aggregati su un insieme di righe già normalizzate/filtrate. */
export function calcolaContatori(righe: RigaStorico[]): ContatoriStorico {
  let eseguiti = 0;
  let negativi = 0;
  let sostValvola = 0;
  let miniBag = 0;
  let rgStop = 0;
  for (const r of righe) {
    if (r.eseguito === 'SI') eseguiti += 1;
    else if (r.eseguito === 'NO') negativi += 1;
    if (r.sostValvola === 'SI') sostValvola += 1;
    if (r.miniBag === 'SI') miniBag += 1;
    if (r.rgStop === 'SI') rgStop += 1;
  }
  return {
    totale: righe.length,
    esitati: eseguiti + negativi,
    eseguiti,
    negativi,
    sostValvola,
    miniBag,
    rgStop,
  };
}

export function slicePagina<T>(righe: T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return righe.slice(start, start + pageSize);
}
