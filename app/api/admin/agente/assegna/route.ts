import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { risolviEsecutore } from '@/lib/agente/risolviEsecutore';
import { raggruppaPerPiano, type RigaRisolta } from '@/lib/agente/raggruppaPerPiano';
import { sincronizzaRapportini } from '@/lib/interventi/sincronizzaRapportini';

export const runtime = 'nodejs';

type PianRow = { id: string; file: string; odl: string | null; matricola: string | null; indirizzo: string | null; comune: string | null; data: string; esecutore: string | null };

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const userId = auth.user.id;

  let body: { ids?: string[] } = {};
  try { body = (await req.json()) as typeof body; } catch { body = {}; }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
  if (ids.length === 0) return NextResponse.json({ error: 'Nessuna riga selezionata.' }, { status: 400 });

  try {
    // 1) righe selezionate
    const { data: rowsRaw, error: eRows } = await supabaseAdmin
      .from('agente_pianificabili')
      .select('id, file, odl, matricola, indirizzo, comune, data, esecutore')
      .in('id', ids);
    if (eRows) throw eRows;
    const rows = (rowsRaw ?? []) as PianRow[];
    if (rows.length === 0) return NextResponse.json({ error: 'Righe non trovate.' }, { status: 404 });

    // 2) config per-file (committente/attivita/template) + staff
    const files = [...new Set(rows.map((r) => r.file))];
    const { data: cfgRows } = await supabaseAdmin.from('agente_file_config').select('file, attivita, template_id').in('file', files);
    const cfgByFile = new Map<string, { attivita: string; template_id: string | null }>();
    for (const c of (cfgRows ?? []) as Array<{ file: string; attivita: string; template_id: string | null }>) cfgByFile.set(c.file, { attivita: c.attivita, template_id: c.template_id });
    const { data: staffRows } = await supabaseAdmin.from('staff').select('id, display_name');
    const staff = (staffRows ?? []) as { id: string; display_name: string }[];

    // 3) risolvi esecutore; raccogli i non risolti
    const risolte: (RigaRisolta & { file: string })[] = [];
    const nonRisoltiMap = new Map<string, { esecutore: string; motivo: 'non_trovato' | 'ambiguo'; n: number }>();
    for (const r of rows) {
      const res = risolviEsecutore(r.esecutore ?? '', staff);
      if ('errore' in res) {
        const key = `${r.esecutore ?? ''}|${res.errore}`;
        const cur = nonRisoltiMap.get(key) ?? { esecutore: r.esecutore ?? '', motivo: res.errore, n: 0 };
        cur.n += 1; nonRisoltiMap.set(key, cur);
        continue;
      }
      risolte.push({ id: r.id, file: r.file, odl: r.odl, matricola: r.matricola, indirizzo: r.indirizzo, comune: r.comune, data: r.data, staffId: res.staffId, staffName: res.staffName });
    }

    // 4) per ogni file (template/attivita possono differire) raggruppa e crea i piani
    const avvisi: string[] = [];
    let pianiCreati = 0; let rapportiniCreati = 0;
    for (const file of files) {
      const cfg = cfgByFile.get(file);
      if (!cfg || !cfg.template_id) { avvisi.push(`File ${file}: template non configurato (imposta agente_file_config.template_id).`); continue; }
      const righeFile = risolte.filter((r) => r.file === file);
      const piani = raggruppaPerPiano(righeFile, cfg.attivita);
      for (const p of piani) {
        // anti-duplicato: elimina piani residui SENZA rapportini per (data, territorio=comune)
        const { data: esistenti } = await supabaseAdmin.from('mappa_piani').select('id').eq('data', p.data).eq('territorio', p.comune);
        for (const ex of (esistenti ?? []) as Array<{ id: string }>) {
          const { count } = await supabaseAdmin.from('rapportini').select('id', { count: 'exact', head: true }).eq('piano_id', ex.id);
          if (!count) await supabaseAdmin.from('mappa_piani').delete().eq('id', ex.id);
        }
        // crea piano + operatori
        const { data: piano, error: ePiano } = await supabaseAdmin.from('mappa_piani').insert({
          data: p.data, territorio: p.comune, note: null, stato: 'confermato', created_by: userId, updated_by: userId,
        }).select('id').single();
        if (ePiano || !piano) { avvisi.push(`Piano ${p.comune} ${p.data}: ${ePiano?.message ?? 'creazione fallita'}.`); continue; }
        const pianoId = (piano as { id: string }).id;
        const opRows = p.operatori.map((o) => ({
          piano_id: pianoId, staff_id: o.staffId, staff_name: o.staffName, colore: '#2563EB',
          km: 0, task_count: o.tasks.length, start_address: null, tasks: o.tasks, polyline: [],
        }));
        const { error: eOp } = await supabaseAdmin.from('mappa_piani_operatori').insert(opRows);
        if (eOp) { avvisi.push(`Operatori ${p.comune} ${p.data}: ${eOp.message}.`); continue; }
        // rapportini (sincronizzaRapportini chiama ensureInterventiForPiano internamente)
        const res = await sincronizzaRapportini(supabaseAdmin, pianoId, { templateId: cfg.template_id, overwrite: 'replace' });
        if (!res.ok) { avvisi.push(`Rapportini ${p.comune} ${p.data}: ${res.error ?? 'conflitto'} (status ${res.status}).`); continue; }
        pianiCreati += 1;
        rapportiniCreati += res.rapportini.length;
        if (res.interventiWarning) avvisi.push(`Interventi ${p.comune} ${p.data}: ${res.interventiWarning}`);
      }
    }

    return NextResponse.json({
      ok: true, pianiCreati, rapportiniCreati,
      nonRisolti: [...nonRisoltiMap.values()], avvisi,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore assegna.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
