import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { chiaveValida } from '@/lib/apiExportKey';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { decideEsecuzione, diffColonne, type RegolaMappa } from '@/lib/agente/decisione';

export const runtime = 'nodejs';

type FileColonne = { nome: string; isMaster?: boolean; colonne: string[] };

type ConfigRow = {
  enabled: boolean;
  giorni: number[] | null;
  ora: string | null;
  dry_run: boolean;
  finestra_giorni: number | null;
  mappatura: RegolaMappa[] | null;
  esito_positivo: string | null;
  esito_negativo: string | null;
  ultima_rivendicazione_giorno: string | null;
};

export async function POST(req: Request) {
  if (!chiaveValida(req)) {
    return NextResponse.json({ error: 'Chiave non valida.' }, { status: 401 });
  }

  let body: { files?: FileColonne[] } = {};
  try {
    body = (await req.json()) as { files?: FileColonne[] };
  } catch {
    body = {};
  }

  try {
    // 1) carica config singleton
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from('agente_config')
      .select(
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno',
      )
      .eq('id', 1)
      .single();
    if (cfgErr || !cfg) throw cfgErr ?? new Error('Config agente assente.');
    const config = cfg as ConfigRow;

    const now = new Date();

    // 2) heartbeat
    await supabaseAdmin
      .from('agente_config')
      .update({ ultimo_contatto_il: now.toISOString() })
      .eq('id', 1);

    // 3) snapshot colonne per file (best-effort, non blocca la decisione)
    const files = Array.isArray(body.files) ? body.files : [];
    if (files.length > 0) {
      const nomi = files.map((f) => f.nome);
      const { data: prevRows } = await supabaseAdmin
        .from('agente_file_colonne')
        .select('file, colonne')
        .in('file', nomi);
      const precedentiByFile = new Map<string, string[]>();
      for (const r of (prevRows ?? []) as Array<{ file: string; colonne: string[] | null }>) {
        precedentiByFile.set(r.file, r.colonne ?? []);
      }
      const upserts = files.map((f) => {
        const precedenti = precedentiByFile.get(f.nome) ?? [];
        const nuoveColonne = Array.isArray(f.colonne) ? f.colonne : [];
        const diff = diffColonne(precedenti, nuoveColonne);
        return {
          file: f.nome,
          is_master: f.isMaster === true,
          colonne: nuoveColonne,
          colonne_nuove: diff.nuove,
          colonne_sparite: diff.sparite,
          rilevato_il: now.toISOString(),
        };
      });
      await supabaseAdmin.from('agente_file_colonne').upsert(upserts, { onConflict: 'file' });
    }

    // 4) decisione (fuso Europe/Rome)
    const parti = partiRoma(now);
    const eseguiOra = decideEsecuzione({
      enabled: config.enabled,
      giorni: config.giorni ?? [],
      ora: config.ora ?? '21:00',
      weekday: parti.weekday,
      oraCorrente: parti.oraCorrente,
      oggi: parti.oggi,
      ultimaRivendicazione: config.ultima_rivendicazione_giorno,
    });

    // 5) rivendica il giorno (un solo giro/die)
    if (eseguiOra) {
      await supabaseAdmin
        .from('agente_config')
        .update({ ultima_rivendicazione_giorno: parti.oggi })
        .eq('id', 1);
    }

    return NextResponse.json(
      {
        eseguiOra,
        dryRun: config.dry_run,
        finestraGiorni: config.finestra_giorni ?? 15,
        mappatura: config.mappatura ?? [],
        esitoPositivo: config.esito_positivo ?? 'eseguito',
        esitoNegativo: config.esito_negativo ?? 'No',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore tick.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
