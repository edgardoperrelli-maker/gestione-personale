import 'server-only';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { esitoOkDaIntervento } from '@/lib/limitazione/exportLimMassive';
import { prezzoPerData, valoreRiga, type ListinoRiga } from './valorizza';
import { attivitaCanonica } from './attivitaCanonica';
import { caricaAliasAttivita } from './aliasAttivita';
import { deduplicaMassivePerMatricola, type RigaProduzione } from './aggregaProduzione';
import { aggregaCandele, type CandelaOperatore, type RigaCandela } from './aggregaCandele';
import { giorniSettimana } from './settimana';

// Loader indipendente per le "candele settimanali per operatore" (design 2026-07-02): query
// scoperta al range richiesto (≤7 giorni), NON condivisa con caricaProduzioneEconomica (loader
// principale) per non accoppiare i due payload — il filtro periodo qui è esplicitamente
// scollegato dal periodo di pagina.

const PAGE = 1000;
// Stessa lista di caricaProduzioneEconomica in load.ts: duplicata qui (2 elementi soli, non vale
// la pena importarla e accoppiare i due loader).
const COMMITTENTI = ['acea', 'lim_massive'];

interface InterventoRow {
  id: string;
  odl: string | null;
  data: string | null;
  staff_id: string | null;
  intervento_tipo: string | null;
  esito: string | null;
  stato: string | null;
  committente: string | null;
  comune: string | null;
  matricola_contatore: string | null;
}

/** Giorno successivo di 'YYYY-MM-DD' (bound esclusivo per query robuste a date/timestamp). */
function giornoDopo(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function caricaInterventiSettimana(from: string, to: string): Promise<InterventoRow[]> {
  const rows: InterventoRow[] = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, staff_id, intervento_tipo, esito, stato, committente, comune, matricola_contatore')
      .in('committente', COMMITTENTI)
      .gte('data', from)
      .lt('data', giornoDopo(to))
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as InterventoRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export async function caricaCandeleSettimanali(
  from: string,
  to: string,
): Promise<{ from: string; to: string; operatori: CandelaOperatore[] }> {
  const [listinoRes, interventi, staffRes, alias] = await Promise.all([
    supabaseAdmin.from('acea_listino').select('id, attivita, prezzo, valido_dal, valido_al, attivo').eq('committente', 'acea'),
    caricaInterventiSettimana(from, to),
    supabaseAdmin.from('staff').select('id, display_name'),
    caricaAliasAttivita(),
  ]);
  if (listinoRes.error) throw listinoRes.error;
  if (staffRes.error) throw staffRes.error;

  const listino: ListinoRiga[] = ((listinoRes.data ?? []) as Array<{
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

  const staff = new Map<string, string>();
  for (const r of (staffRes.data ?? []) as Array<{ id: string; display_name: string | null }>) {
    staff.set(r.id, (r.display_name ?? '').trim() || 'Operatore');
  }

  const valore = (attivitaKey: string, data: string): number => {
    if (!attivitaKey) return 0;
    const sel = prezzoPerData(listino, attivitaKey, data);
    return sel ? valoreRiga(sel.prezzo) : 0;
  };

  const righeCandela: RigaCandela[] = [];
  const temporanee: RigaProduzione[] = [];
  // Object identity come chiave: deduplicaMassivePerMatricola filtra (out.push(r)) senza clonare,
  // quindi le righe sopravvissute sono LE STESSE referenze passate in `temporanee`.
  const candelaPerTemp = new Map<RigaProduzione, RigaCandela>();

  for (const it of interventi) {
    const canon = attivitaCanonica(it.committente, it.intervento_tipo, it.comune, alias);
    if (!canon || !canon.attivo || canon.committenteEff !== 'acea') continue;
    const staffId = it.staff_id ?? '';
    const data = (it.data ?? '').slice(0, 10);
    if (!staffId || !data) continue; // riga senza operatore o senza data (stesso pattern di aggregaEsiti/aggregaPersonale)
    const operatore = staff.get(staffId) ?? 'Sconosciuto';
    const esitoOk = esitoOkDaIntervento(it.stato, it.esito);

    const rigaCandela: RigaCandela = { staffId, operatore, data, esitoOk, valoreDedup: 0 };
    righeCandela.push(rigaCandela);

    // Solo le positive entrano nel dedup matricola (casi limite della spec): il conteggio sopra
    // resta corretto su OGNI riga, il dedup decide solo CHI porta l'€.
    if (esitoOk === true) {
      const temp: RigaProduzione = {
        odl: (it.odl ?? '').trim(),
        voce: null,
        kpi: null,
        attivitaKey: canon.attivitaKey,
        attivitaLabel: canon.attivitaPulita,
        matricola: it.matricola_contatore ?? '',
        data,
        staffId,
        operatore,
        territorioId: '',
        territorio: '',
        valore: valore(canon.attivitaKey, data),
      };
      temporanee.push(temp);
      candelaPerTemp.set(temp, rigaCandela);
    }
  }

  for (const sopravvissuta of deduplicaMassivePerMatricola(temporanee)) {
    const rigaCandela = candelaPerTemp.get(sopravvissuta);
    if (rigaCandela) rigaCandela.valoreDedup = sopravvissuta.valore;
  }

  const settimana = giorniSettimana(from);
  const operatori = aggregaCandele(righeCandela, settimana);
  return { from, to, operatori };
}
