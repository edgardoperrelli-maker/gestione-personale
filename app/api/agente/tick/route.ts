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
  forza_giro: boolean;
  forza_scan: boolean;
  pianifica_data: string | null;
  forza_acea_stato: boolean;
  acea_target: string | null;
  forza_acea_assegna: boolean;
  acea_assegna_data: string | null;
  acea_assegna_dry: boolean;
  forza_acea_sal: boolean;
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
        'enabled, giorni, ora, dry_run, finestra_giorni, mappatura, esito_positivo, esito_negativo, ultima_rivendicazione_giorno, forza_giro, forza_scan, pianifica_data, forza_acea_stato, acea_target, forza_acea_assegna, acea_assegna_data, acea_assegna_dry, forza_acea_sal',
      )
      .eq('id', 1)
      .single();
    if (cfgErr || !cfg) throw cfgErr ?? new Error('Config agente assente.');
    const config = cfg as ConfigRow;

    const now = new Date();

    // heartbeat best-effort: un errore qui NON deve bloccare la decisione del tick
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
      // colonne fresche consegnate: azzera la richiesta di ri-scan ("Aggiorna tabella")
      if (config.forza_scan === true) {
        await supabaseAdmin.from('agente_config').update({ forza_scan: false }).eq('id', 1);
      }
    }

    // 4) decisione (fuso Europe/Rome) + forzatura "Esegui ora"
    const parti = partiRoma(now);
    const forzato = config.forza_giro === true;
    const eseguiOra =
      forzato ||
      decideEsecuzione({
        enabled: config.enabled,
        giorni: config.giorni ?? [],
        ora: config.ora ?? '21:00',
        weekday: parti.weekday,
        oraCorrente: parti.oraCorrente,
        oggi: parti.oggi,
        ultimaRivendicazione: config.ultima_rivendicazione_giorno,
      });

    // 5) se si esegue: rivendica il giorno e (se forzato) azzera il flag one-shot
    if (eseguiOra) {
      const patch: Record<string, unknown> = { ultima_rivendicazione_giorno: parti.oggi };
      if (forzato) patch.forza_giro = false;
      const { error: claimErr } = await supabaseAdmin
        .from('agente_config')
        .update(patch)
        .eq('id', 1);
      if (claimErr) throw claimErr;
    }

    // Giro ACEA on-demand: flag one-shot, consumato qui (come forza_giro con eseguiOra).
    const aceaStato = config.forza_acea_stato === true;
    if (aceaStato) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_stato: false }).eq('id', 1);
    }

    // Assegnazione su ACEA on-demand: flag one-shot, consumato qui.
    const aceaAssegna = config.forza_acea_assegna === true;
    if (aceaAssegna) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_assegna: false }).eq('id', 1);
    }

    // Giro "Leggi SAL" on-demand: flag one-shot, consumato qui.
    const aceaSal = config.forza_acea_sal === true;
    if (aceaSal) {
      await supabaseAdmin.from('agente_config').update({ forza_acea_sal: false }).eq('id', 1);
    }

    return NextResponse.json(
      {
        eseguiOra,
        dryRun: config.dry_run,
        finestraGiorni: config.finestra_giorni ?? 15,
        mappatura: config.mappatura ?? [],
        esitoPositivo: config.esito_positivo ?? 'eseguito',
        esitoNegativo: config.esito_negativo ?? 'No',
        forzaScan: config.forza_scan === true,
        pianificaData: config.pianifica_data ?? null,
        aceaStato,
        aceaTarget: config.acea_target ?? 'dunning',
        aceaAssegna,
        aceaAssegnaData: config.acea_assegna_data ?? null,
        aceaAssegnaDry: config.acea_assegna_dry !== false,
        aceaSal,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore tick.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
