import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';
import { buildZipEntriesTaskVia, type FotoManualeZip, type InfoRichiestaTaskVia } from '@/lib/interventi/manuali/zipFotoTaskVia';
import { richiesteDelGruppo, viaRisoltaRichiesta, type ViaVoce } from '@/lib/interventi/manuali/gruppiFotoItalgas';
import { nomeFotoFile, identificativoFoto, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import { unioneCampi } from '@/utils/rapportini/campiDiVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

/**
 * Committente delle richieste manuali "Italgas mobile" (template ITALGAS PER MOBILI: foto
 * vecchio/nuovo/minibag). Per queste lo ZIP si organizza per VIA → matricola (vedi
 * gruppiFotoItalgas.ts): non ci si affida al collegamento al task-via padre, spesso assente
 * (il "+" può nascere da un rapportino ITALGAS classico) o orfano (rigenerazione del piano).
 */
const COMMITTENTE_ITALGAS_MOBILE = 'italgas';

type VoceRow = {
  id: string;
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  risposte: Record<string, unknown> | null;
  campi_snapshot?: unknown;
};

type RichiestaRow = {
  id: string;
  committente: string | null;
  parent_voce_id: string | null;
  template_id: string | null;
  dati_correnti: { anagrafica?: Record<string, unknown> } | null;
};

const testo = (x: unknown): string | null => {
  const t = String(x ?? '').trim();
  return t === '' ? null : t;
};

function toRichiestaItalgas(r: RichiestaRow) {
  const anag = (r.dati_correnti?.anagrafica ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    parentVoceId: r.parent_voce_id,
    viaAnagrafica: testo(anag.via),
    matricola: testo(anag.matricola),
  };
}

/** Costruisce la mappa richiesta_id → {via, matricola, fallbackId} per il layout ZIP per-via. */
async function buildInfoPerRichiesta(
  richieste: RichiestaRow[],
  vociById: Map<string, ViaVoce>,
): Promise<Map<string, InfoRichiestaTaskVia>> {
  // Priorità nome foto (fallback quando la matricola manca): dal template PROPRIO di ciascuna
  // richiesta (di norma "ITALGAS PER MOBILI"), letto live — non dal template del rapportino,
  // che qui è irrilevante (il gruppo italgas prescinde dal rapportino padre).
  const templateIds = [...new Set(richieste.map((r) => r.template_id).filter((x): x is string => !!x))];
  const priorityPerTemplate = new Map<string, FotoIdCampo[]>();
  if (templateIds.length > 0) {
    const { data: tpls } = await supabaseAdmin
      .from('rapportino_template')
      .select('id, foto_id_priority')
      .in('id', templateIds);
    for (const t of (tpls ?? []) as Array<{ id: string; foto_id_priority?: string[] | null }>) {
      priorityPerTemplate.set(t.id, (t.foto_id_priority ?? []) as FotoIdCampo[]);
    }
  }

  const infoPerRichiesta = new Map<string, InfoRichiestaTaskVia>();
  for (const r of richieste) {
    const ri = toRichiestaItalgas(r);
    const via = viaRisoltaRichiesta(ri, vociById);
    const ids = {
      matricola: ri.matricola ?? undefined,
      indirizzo: via ?? undefined,
    };
    const priority = r.template_id ? priorityPerTemplate.get(r.template_id) ?? [] : [];
    infoPerRichiesta.set(r.id, {
      via,
      matricola: ri.matricola,
      fallbackId: identificativoFoto(ids, priority),
    });
  }
  return infoPerRichiesta;
}

export async function GET(req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;
  const url = new URL(req.url);
  const voceId = url.searchParams.get('voceId');
  // `via`: download del gruppo "Italgas mobile" di quella via (vedi voci-foto). Si distingue la
  // stringa vuota (via davvero assente) dal parametro assente (.has, non solo truthiness).
  const haVia = url.searchParams.has('via');
  const viaParam = haVia ? url.searchParams.get('via') : null;

  // ── 1. Rapportino (serve campi_snapshot per individuare campi tipo='foto' + template per la
  //      priorità nome-foto delle voci CLASSICHE, Fonte B/C — non del gruppo Italgas mobile,
  //      che usa il template proprio di ciascuna richiesta, vedi buildInfoPerRichiesta) ──────
  const { data: rap, error: rapErr } = await supabaseAdmin
    .from('rapportini')
    .select('id, campi_snapshot, template_id')
    .eq('id', rapportinoId)
    .maybeSingle();
  if (rapErr) return NextResponse.json({ error: rapErr.message }, { status: 500 });
  if (!rap) return NextResponse.json({ error: 'rapportino non trovato' }, { status: 404 });

  const campiSnapshot = ((rap.campi_snapshot ?? []) as TemplateCampo[]).sort(
    (a, b) => a.ordine - b.ordine,
  );
  const campiFoto = campiSnapshot.filter((c) => c.tipo === 'foto');

  let fotoPriority: FotoIdCampo[] = [];
  const templateId = (rap as { template_id?: string | null }).template_id;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('foto_id_priority')
      .eq('id', templateId)
      .maybeSingle();
    fotoPriority = (tpl?.foto_id_priority ?? []) as FotoIdCampo[];
  }

  // ── 2. Voci del rapportino ──────────────────────────────────────────────────
  let vociQuery = supabaseAdmin
    .from('rapportino_voci')
    .select('id, nominativo, matricola, pdr, odl, via, risposte, campi_snapshot')
    .eq('rapportino_id', rapportinoId);
  if (voceId) vociQuery = vociQuery.eq('id', voceId);
  const { data: vociRows, error: vociErr } = await vociQuery.order('ordine', { ascending: true });
  if (vociErr) return NextResponse.json({ error: vociErr.message }, { status: 500 });
  const tipizzate = (vociRows ?? []) as VoceRow[];

  // Nome dello ZIP per-voce (via/odl della voce richiesta).
  const voceForName: { via: string | null; odl: string | null } | null =
    voceId && tipizzate[0] ? { via: tipizzate[0].via, odl: tipizzate[0].odl } : null;

  // ── 3. Fonte A: foto da interventi manuali (tabella interventi_manuali_foto) ───
  // Le richieste "Italgas mobile" si raggruppano per VIA (indipendente dal collegamento al
  // task-via, spesso assente/orfano — vedi gruppiFotoItalgas.ts); le altre (lim_massive, acea,
  // altro) seguono il percorso storico (file_name + buildZipEntries). Un voceId classico
  // (download per singola voce non-manuale) esclude il gruppo italgas — comportamento storico.
  const fotoManuali: FotoZip[] = [];
  let entriesTaskVia: ReturnType<typeof buildZipEntriesTaskVia> = [];
  if (!voceId) {
    const { data: tutteLeVoci } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, via')
      .eq('rapportino_id', rapportinoId);
    const vociById = new Map<string, ViaVoce>(((tutteLeVoci ?? []) as ViaVoce[]).map((v) => [v.id, v]));

    const { data: richieste } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, committente, parent_voce_id, template_id, dati_correnti')
      .eq('rapportino_id', rapportinoId)
      .order('created_at', { ascending: true });
    const richiesteRows = (richieste ?? []) as RichiestaRow[];

    const richiesteItalgasRows = richiesteRows.filter((r) => r.committente === COMMITTENTE_ITALGAS_MOBILE);
    const italgasRi = richiesteItalgasRows.map(toRichiestaItalgas);
    const selezionateRi = haVia ? richiesteDelGruppo(italgasRi, vociById, viaParam) : italgasRi;
    const idsSelezionati = new Set(selezionateRi.map((r) => r.id));
    const richiesteItalgasSel = richiesteItalgasRows.filter((r) => idsSelezionati.has(r.id));

    // "Scarica tutto" (né voceId né via): include anche gli altri committenti (lim_massive,
    // acea, altro). Il download per-via è dedicato al solo gruppo italgas.
    const richiesteAltreIds = haVia
      ? new Set<string>()
      : new Set(richiesteRows.filter((r) => r.committente !== COMMITTENTE_ITALGAS_MOBILE).map((r) => r.id));

    const idsDaCaricare = [...richiesteItalgasSel.map((r) => r.id), ...richiesteAltreIds];
    if (idsDaCaricare.length > 0) {
      const { data: fotoRows, error: fotoErr } = await supabaseAdmin
        .from('interventi_manuali_foto')
        .select('richiesta_id, storage_path, file_name, slot_chiave, slot_etichetta')
        .in('richiesta_id', idsDaCaricare);
      if (fotoErr) return NextResponse.json({ error: fotoErr.message }, { status: 500 });
      const fotoManualiRows = (fotoRows ?? []) as FotoManualeZip[];

      if (richiesteItalgasSel.length > 0) {
        const infoPerRichiesta = await buildInfoPerRichiesta(richiesteItalgasSel, vociById);
        entriesTaskVia = buildZipEntriesTaskVia(
          fotoManualiRows.filter((f) => infoPerRichiesta.has(f.richiesta_id)),
          infoPerRichiesta,
        );
      }
      // Matricola per richiesta (dati correnti): SOLO per disambiguare un'eventuale collisione
      // di file_name tra richieste diverse (es. stesso ODL, priorità lim_massive odl→matricola,
      // due misuratori sostituiti sullo stesso ordine di lavoro — caso reale verificato).
      const matricolaPerRichiesta = new Map(richiesteRows.map((r) => [r.id, toRichiestaItalgas(r).matricola]));
      fotoManuali.push(...fotoManualiRows
        .filter((f) => richiesteAltreIds.has(f.richiesta_id))
        .map(({ richiesta_id, storage_path, file_name }) => ({
          richiesta_id,
          storage_path,
          file_name,
          matricola: matricolaPerRichiesta.get(richiesta_id) ?? null,
        })));
    }
  }
  // voceId (classico, non-italgas): nessuna foto manuale inclusa — comportamento storico.

  // ── 4. Fonte B: foto nei campi tipo='foto' delle voci (risposte[campo.chiave]) ─
  // Le chiavi foto sono l'UNIONE di quelle del rapportino + quelle per-voce (flusso del
  // gruppo attività della voce): un rapportino misto scarica le foto di tutti i flussi.
  // Non si applica al download per-via (`haVia`): quel percorso è dedicato al gruppo
  // Italgas mobile, non alle voci classiche con foto in `risposte`.
  const fotoVoci: FotoZip[] = [];
  if (!haVia) {
    const campiFotoZip = unioneCampi(
      campiSnapshot,
      tipizzate.map((v) => (Array.isArray(v.campi_snapshot) ? (v.campi_snapshot as TemplateCampo[]) : null)),
    ).filter((c) => c.tipo === 'foto');

    for (const v of campiFotoZip.length > 0 ? tipizzate : []) {
      const ids = {
        pdr: v.pdr ?? undefined,
        matricola: v.matricola ?? undefined,
        odl: v.odl ?? undefined,
        indirizzo: v.via ?? undefined,
      };
      for (const campo of campiFotoZip) {
        const paths = comeArrayFoto((v.risposte ?? {})[campo.chiave]);
        paths.forEach((storagePath, i) => {
          const ext = storagePath.split('.').pop() ?? 'jpg';
          let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
          if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
          // richiesta_id = voce id (usato da buildZipEntries per sottocartelle su collisione)
          fotoVoci.push({ richiesta_id: v.id, storage_path: storagePath, file_name: fileName, matricola: v.matricola });
        });
      }
    }
  }

  // ── 4-bis. Fonte C: foto delle righe-misuratore (risanamento), scope='misuratore' ─
  const fotoRighe: FotoZip[] = [];
  if (!voceId && !haVia) {
    const campiMisuratore = campiFoto.filter((c) => ((c as { scope_foto?: string }).scope_foto ?? 'misuratore') === 'misuratore');
    if (campiMisuratore.length > 0) {
      const { data: righeRows } = await supabaseAdmin
        .from('rapportino_righe')
        .select('id, matricola, pdr, nominativo, risposte')
        .eq('rapportino_id', rapportinoId)
        .order('ordine', { ascending: true });
      for (const r of (righeRows ?? []) as Array<{ id: string; matricola: string | null; pdr: string | null; nominativo: string | null; risposte: Record<string, unknown> | null }>) {
        const ids = { pdr: r.pdr ?? undefined, matricola: r.matricola ?? undefined };
        for (const campo of campiMisuratore) {
          const paths = comeArrayFoto((r.risposte ?? {})[campo.chiave]);
          paths.forEach((storagePath, i) => {
            const ext = storagePath.split('.').pop() ?? 'jpg';
            let fileName = nomeFotoFile(campo.etichetta, ids, ext, fotoPriority);
            if (paths.length > 1) fileName = fileName.replace(/(\.[^.]+)$/, `_${i + 1}$1`);
            fotoRighe.push({ richiesta_id: r.id, storage_path: storagePath, file_name: fileName, matricola: r.matricola });
          });
        }
      }
    }
  }

  // ── 5. Unisce le fonti e verifica che ci sia almeno una foto ───────────────
  const tutteLePhoto = [...fotoManuali, ...fotoVoci, ...fotoRighe];
  if (entriesTaskVia.length + tutteLePhoto.length === 0) {
    return NextResponse.json({ error: 'Nessuna foto da scaricare.' }, { status: 404 });
  }

  // ── 6. Calcola path ZIP (subfolder su collisione) e scarica dal bucket ────────
  const entries = [...entriesTaskVia, ...buildZipEntries(tutteLePhoto)];
  const zip = new JSZip();
  const saltate: string[] = [];

  for (const e of entries) {
    const { data: blob, error: dlErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .download(e.storagePath);
    if (dlErr || !blob) {
      saltate.push(e.storagePath);
      continue; // salta (non interrompe) — lo ZIP conterrà le foto disponibili
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    zip.file(e.zipPath, buf);
  }

  // Se ogni foto è saltata → nessun file nel ZIP → errore
  if (saltate.length === entries.length) {
    return NextResponse.json({ error: 'nessuna_foto_scaricabile', saltate }, { status: 502 });
  }

  const archive = await zip.generateAsync({ type: 'nodebuffer' });
  let fileName = `foto-rapportino-${rapportinoId}.zip`;
  if (voceId) {
    const base = (voceForName?.via || voceForName?.odl || `voce-${voceId}`).replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    fileName = `foto-${base || 'voce'}.zip`;
  } else if (haVia) {
    const base = (viaParam || 'indirizzo').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
    fileName = `foto-${base || 'indirizzo'}.zip`;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  };
  if (saltate.length > 0) headers['X-Skipped-Photos'] = String(saltate.length);

  return new NextResponse(new Uint8Array(archive), { status: 200, headers });
}
