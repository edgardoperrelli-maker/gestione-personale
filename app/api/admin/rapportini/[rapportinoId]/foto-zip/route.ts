import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { buildZipEntries, type FotoZip } from '@/lib/interventi/manuali/buildZipEntries';
import { buildZipEntriesTaskVia, type FotoManualeZip, type InfoRichiestaTaskVia } from '@/lib/interventi/manuali/zipFotoTaskVia';
import { isTaskVia, voceTaskVia } from '@/lib/interventi/manuali/taskVia';
import { nomeFotoFile, identificativoFoto, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import { comeArrayFoto } from '@/utils/rapportini/comeArrayFoto';
import { unioneCampi } from '@/utils/rapportini/campiDiVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

type VoceRow = {
  id: string;
  nominativo: string | null;
  matricola: string | null;
  pdr: string | null;
  odl: string | null;
  via: string | null;
  attivita: string | null;
  manuale: boolean | null;
  risposte: Record<string, unknown> | null;
  campi_snapshot?: unknown;
};

type RichiestaRow = {
  id: string;
  parent_voce_id: string | null;
  dati_correnti: { anagrafica?: Record<string, unknown> } | null;
};

const testo = (x: unknown): string | null => {
  const t = String(x ?? '').trim();
  return t === '' ? null : t;
};

export async function GET(req: Request, { params }: { params: Promise<{ rapportinoId: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { rapportinoId } = await params;
  const voceId = new URL(req.url).searchParams.get('voceId');

  // ── 1. Rapportino (serve campi_snapshot per individuare campi tipo='foto') ──────
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

  // Priorità nome foto + flag task-via: letti live dal template corrente.
  // Template assente/cancellato o errore di lettura → default storico.
  let fotoPriority: FotoIdCampo[] = [];
  let tplTaskVia = false;
  const templateId = (rap as { template_id?: string | null }).template_id;
  if (templateId) {
    const { data: tpl } = await supabaseAdmin
      .from('rapportino_template')
      .select('foto_id_priority, task_via')
      .eq('id', templateId)
      .maybeSingle();
    fotoPriority = ((tpl?.foto_id_priority ?? []) as FotoIdCampo[]);
    tplTaskVia = Boolean((tpl as { task_via?: boolean } | null)?.task_via);
  }

  // ── 2. Voci del rapportino (usate sia per le foto nei campi sia per il task-via) ─
  let vociQuery = supabaseAdmin
    .from('rapportino_voci')
    .select('id, nominativo, matricola, pdr, odl, via, attivita, manuale, risposte, campi_snapshot')
    .eq('rapportino_id', rapportinoId);
  if (voceId) vociQuery = vociQuery.eq('id', voceId);
  const { data: vociRows, error: vociErr } = await vociQuery.order('ordine', { ascending: true });
  if (vociErr) return NextResponse.json({ error: vociErr.message }, { status: 500 });
  const tipizzate = (vociRows ?? []) as VoceRow[];

  // Nome dello ZIP per-voce (via/odl della voce richiesta).
  const voceForName: { via: string | null; odl: string | null } | null =
    voceId && tipizzate[0] ? { via: tipizzate[0].via, odl: tipizzate[0].odl } : null;

  // Giro task-via (BONIFICHE EXTRA): template task-via puro OPPURE almeno una voce
  // con l'attività contenitore. In questi giri le foto vivono negli interventi "+"
  // (interventi_manuali_foto) e lo ZIP va organizzato per VIA / matricola.
  const giroTaskVia = tplTaskVia || tipizzate.some((v) => isTaskVia(v));
  const voceContenitore =
    !!voceId && !!tipizzate[0] && tipizzate[0].manuale !== true && voceTaskVia(tipizzate[0], { tutto: tplTaskVia });

  // ── 3. Fonte A: foto da interventi manuali (tabella interventi_manuali_foto) ───
  // Intero rapportino: tutte le richieste. Per-voce: SOLO se la voce è un task-via
  // contenitore → le richieste agganciate a quella via (parent_voce_id).
  const fotoManuali: FotoZip[] = [];
  let entriesTaskVia: ReturnType<typeof buildZipEntriesTaskVia> = [];
  if (!voceId || voceContenitore) {
    let richiesteQuery = supabaseAdmin
      .from('interventi_manuali')
      .select('id, parent_voce_id, dati_correnti')
      .eq('rapportino_id', rapportinoId);
    if (voceId) richiesteQuery = richiesteQuery.eq('parent_voce_id', voceId);
    const { data: richieste } = await richiesteQuery;
    const richiesteRows = (richieste ?? []) as RichiestaRow[];
    const richiestaIds = richiesteRows.map((r) => r.id);
    if (richiestaIds.length > 0) {
      const { data: fotoRows, error: fotoErr } = await supabaseAdmin
        .from('interventi_manuali_foto')
        .select('richiesta_id, storage_path, file_name, slot_chiave, slot_etichetta')
        .in('richiesta_id', richiestaIds);
      if (fotoErr) return NextResponse.json({ error: fotoErr.message }, { status: 500 });
      const fotoManualiRows = (fotoRows ?? []) as FotoManualeZip[];

      if (giroTaskVia) {
        // Layout BONIFICHE EXTRA: cartella per via del task padre, nome per matricola
        // (dati CORRENTI, quindi post-approvazione) + slot (vecchio/nuovo/minibag).
        const viaPerVoce = new Map(tipizzate.map((v) => [v.id, v.via]));
        const infoPerRichiesta = new Map<string, InfoRichiestaTaskVia>();
        for (const r of richiesteRows) {
          const anag = (r.dati_correnti?.anagrafica ?? {}) as Record<string, unknown>;
          const viaAnag = testo(anag.via);
          const ids = {
            pdr: testo(anag.pdr) ?? undefined,
            matricola: testo(anag.matricola) ?? undefined,
            odl: testo(anag.odl) ?? undefined,
            indirizzo: viaAnag ?? undefined,
          };
          infoPerRichiesta.set(r.id, {
            via: (r.parent_voce_id ? viaPerVoce.get(r.parent_voce_id) ?? null : null) ?? viaAnag,
            matricola: testo(anag.matricola),
            fallbackId: identificativoFoto(ids, fotoPriority),
          });
        }
        entriesTaskVia = buildZipEntriesTaskVia(fotoManualiRows, infoPerRichiesta);
      } else {
        // Flusso storico (rapportini senza task-via): file_name salvato + collisioni.
        fotoManuali.push(...fotoManualiRows.map(({ richiesta_id, storage_path, file_name }) => ({
          richiesta_id,
          storage_path,
          file_name,
        })));
      }
    }
  }

  // ── 4. Fonte B: foto nei campi tipo='foto' delle voci (risposte[campo.chiave]) ─
  // Le chiavi foto sono l'UNIONE di quelle del rapportino + quelle per-voce (flusso del
  // gruppo attività della voce): un rapportino misto scarica le foto di tutti i flussi.
  const fotoVoci: FotoZip[] = [];
  {
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
          fotoVoci.push({ richiesta_id: v.id, storage_path: storagePath, file_name: fileName });
        });
      }
    }
  }

  // ── 4-bis. Fonte C: foto delle righe-misuratore (risanamento), scope='misuratore' ─
  const fotoRighe: FotoZip[] = [];
  if (!voceId) {
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
            fotoRighe.push({ richiesta_id: r.id, storage_path: storagePath, file_name: fileName });
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
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  };
  if (saltate.length > 0) headers['X-Skipped-Photos'] = String(saltate.length);

  return new NextResponse(new Uint8Array(archive), { status: 200, headers });
}
