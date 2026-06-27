// tools/estrai-odl-sporchi.mjs
// Estrae le voci rapportino con ODL "sporco" (ODL che contiene il PDR, o formato anomalo)
// e produce un Excel su Desktop. Riusabile: node tools/estrai-odl-sporchi.mjs
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// --- carica env da .env.local ---
function loadEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const one = (e) => (Array.isArray(e) ? (e[0] ?? null) : e ?? null);

function categoria(odl, pdr) {
  const o = (odl ?? '').trim();
  const p = (pdr ?? '').trim();
  if (o === '') return 'vuoto';
  if (p !== '' && o === p) return 'A_ODL_E_PDR';
  if (/^[0-9]+$/.test(o)) return 'D_numerico_ok';
  if (/^P[0-9]+$/.test(o)) return 'B_ODS_P_ok';
  if (/^[0-9]+-[0-9]+$/.test(o)) return 'C_ODL_con_lotto_ok';
  return 'E_DA_RIVEDERE';
}

function fmtData(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '');
}

async function main() {
  const PAGE = 1000;
  const righe = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from('rapportino_voci')
      .select('id, odl, pdr, matricola, attivita, via, comune, rapportini(data, staff_name), interventi(odl, committente)')
      .order('id', { ascending: true })
      .range(off, off + PAGE - 1);
    if (error) throw error;
    righe.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const sporche = righe
    .map((r) => ({ ...r, cat: categoria(r.odl, r.pdr) }))
    .filter((r) => r.cat === 'A_ODL_E_PDR' || r.cat === 'E_DA_RIVEDERE')
    .map((r) => {
      const rap = one(r.rapportini);
      const itv = one(r.interventi);
      return {
        voce_id: r.id,
        data: fmtData(rap?.data),
        esecutore: rap?.staff_name ?? '',
        committente: itv?.committente ?? '',
        comune: r.comune ?? '',
        via: r.via ?? '',
        odl_attuale: r.odl ?? '',
        pdr: r.pdr ?? '',
        matricola: r.matricola ?? '',
        attivita: r.attivita ?? '',
        odl_intervento: itv?.odl ?? '',
        motivo: r.cat === 'A_ODL_E_PDR' ? 'ODL = PDR' : 'DA RIVEDERE',
      };
    })
    .sort((a, b) => a.motivo.localeCompare(b.motivo) || b.data.localeCompare(a.data));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ODL da correggere', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { key: 'motivo', header: 'MOTIVO', width: 14 },
    { key: 'data', header: 'DATA', width: 12 },
    { key: 'esecutore', header: 'ESECUTORE', width: 22 },
    { key: 'committente', header: 'COMMITTENTE', width: 14 },
    { key: 'comune', header: 'COMUNE', width: 18 },
    { key: 'via', header: 'VIA', width: 28 },
    { key: 'odl_attuale', header: 'ODL ATTUALE (errato)', width: 20 },
    { key: 'pdr', header: 'PDR', width: 18 },
    { key: 'matricola', header: 'MATRICOLA', width: 18 },
    { key: 'attivita', header: 'ATTIVITA', width: 22 },
    { key: 'odl_intervento', header: 'ODL INTERVENTO (riferimento)', width: 24 },
    { key: 'voce_id', header: 'VOCE_ID', width: 38 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of sporche) ws.addRow(r);

  const out = 'C:/Users/Edgardo/Desktop/odl-da-correggere.xlsx';
  await wb.xlsx.writeFile(out);
  console.log(`Righe sporche: ${sporche.length} (su ${righe.length} voci totali)`);
  console.log(`Excel salvato in: ${out}`);
}

main().catch((e) => { console.error('ERRORE:', e.message ?? e); process.exit(1); });
