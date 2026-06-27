// app/api/admin/agente/acea-preassegnati/route.ts
// Pre-marcatura proattiva: per il giorno scelto restituisce gli ODL già assegnati su ACEA alla risorsa
// GIUSTA (confronto per cognome: esecutore-pianificato ↔ assegnatario-export). Forma compatibile con gli
// esiti per-ODL (esito 'gia-assegnato') così l'anteprima li pre-segna come fatti PRIMA di assegnare.
// Best-effort: se la tabella acea_preassegnati non esiste ancora (migration non lanciata) → righe: [].
import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { cognomeChiave } from '@/lib/agente/aceaBadgePerRisorsa';

export const runtime = 'nodejs';

const vuoto = (data: string) =>
  NextResponse.json({ data, righe: [] }, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const data = String(searchParams.get('data') ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return vuoto(data);

  try {
    // file di committente ACEA (come acea-assegnazioni): esclude LIMITAZIONI MASSIVE
    const { data: cfgRows } = await supabaseAdmin.from('agente_file_config').select('file, committente, attivita');
    const aceaFiles = new Set(
      ((cfgRows ?? []) as { file: string; committente: string; attivita: string | null }[])
        .filter((c) => c.committente === 'acea' && c.attivita !== 'LIMITAZIONI MASSIVE')
        .map((c) => c.file),
    );

    const { data: pianRaw } = await supabaseAdmin
      .from('agente_pianificabili').select('file, odl, esecutore').eq('data', data);
    const pian = ((pianRaw ?? []) as Array<{ file: string; odl: string | null; esecutore: string | null }>)
      .filter((r) => r.odl && aceaFiles.has(r.file));
    if (pian.length === 0) return vuoto(data);

    const odls = [...new Set(pian.map((r) => r.odl as string))];
    const { data: preRaw, error: ePre } = await supabaseAdmin
      .from('acea_preassegnati').select('odl, assegnatario, aggiornato_il').in('odl', odls);
    if (ePre) return vuoto(data); // tabella assente o altro errore → best-effort vuoto
    const preByOdl = new Map(
      ((preRaw ?? []) as Array<{ odl: string; assegnatario: string; aggiornato_il: string }>).map((r) => [r.odl, r]),
    );

    const visti = new Set<string>();
    const righe: Array<{ odl: string; operatore_acea: string; esito: string; motivo: string; dry_run: boolean; creato_il: string }> = [];
    for (const r of pian) {
      const odl = r.odl as string;
      if (visti.has(odl)) continue;
      const pre = preByOdl.get(odl);
      if (!pre) continue;
      // pre-segna SOLO se già assegnato alla risorsa giusta; a risorsa diversa → va assegnato (niente lock)
      if (!r.esecutore || cognomeChiave(r.esecutore) !== cognomeChiave(pre.assegnatario)) continue;
      visti.add(odl);
      righe.push({
        odl, operatore_acea: pre.assegnatario, esito: 'gia-assegnato',
        motivo: `già assegnato su ACEA a ${pre.assegnatario}`, dry_run: false, creato_il: pre.aggiornato_il,
      });
    }
    return NextResponse.json({ data, righe }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return vuoto(data);
  }
}
