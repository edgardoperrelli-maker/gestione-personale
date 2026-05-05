import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  mapSopralluoghiErrorMessage,
  requireSopralluoghiActivity,
  requireSopralluoghiAdmin,
} from '../_helpers';

export const dynamic = 'force-dynamic';

type DatasetSummaryRow = {
  territorio_id: string | null;
  territorio_name: string | null;
  activity_id: string | null;
  activity_name: string | null;
  comune: string;
  totale_civici: number;
  totale_microaree: number;
  primo_caricamento: string | null;
  ultimo_caricamento: string | null;
  pdf_generati: number;
};

type DeleteDatasetPayload = {
  territorio_id?: string | null;
  activity_id?: string | null;
  comune?: string | null;
};

type PatchDatasetPayload = {
  territorio_id?: string | null;
  activity_id?: string | null;
  comune?: string | null;
  new_activity_id?: string | null;
  new_comune?: string | null;
};

type GeneratedAssetRow = {
  id: number;
  pdf_url: string | null;
  excel_url?: string | null;
};

function datasetScopeLabel(params: {
  territorioName?: string | null;
  activityName?: string | null;
  comune?: string | null;
}): string {
  return [
    params.territorioName?.trim() || 'Territorio sconosciuto',
    params.activityName?.trim() || 'Tipologia sconosciuta',
    params.comune?.trim() || 'Comune non specificato',
  ].join(' - ');
}

function isSafePublicAssetUrl(url: string): boolean {
  return url.startsWith('/pdf_sopralluoghi/') || url.startsWith('/xlsx_sopralluoghi/');
}

function deletePublicAsset(url: string | null | undefined) {
  if (!url || !isSafePublicAssetUrl(url)) return;

  const relativePath = url.replace(/^\/+/, '').replace(/\//g, path.sep);
  const absolutePath = path.resolve(process.cwd(), 'public', relativePath);
  const publicRoot = path.resolve(process.cwd(), 'public');

  if (!absolutePath.startsWith(publicRoot)) return;
  if (!fs.existsSync(absolutePath)) return;

  fs.unlinkSync(absolutePath);
}

async function loadGeneratedAssets(params: {
  territorioId: string;
  activityId: string;
  comune: string | null;
}): Promise<GeneratedAssetRow[]> {
  let query = supabaseAdmin
    .from('sopralluoghi_pdf_generati')
    .select('id, pdf_url, excel_url')
    .eq('territorio_id', params.territorioId)
    .eq('activity_id', params.activityId);

  if (params.comune === '') {
    query = query.or('comune.is.null,comune.eq.');
  } else if (params.comune) {
    query = query.eq('comune', params.comune);
  }

  const { data, error } = await query;

  if (!error) {
    return (data ?? []) as GeneratedAssetRow[];
  }

  const normalized = error.message.toLowerCase();
  const missingExcelUrl = normalized.includes('excel_url')
    && (normalized.includes('does not exist') || normalized.includes('schema cache'));

  if (!missingExcelUrl) {
    throw new Error(mapSopralluoghiErrorMessage(error.message));
  }

  let fallbackQuery = supabaseAdmin
    .from('sopralluoghi_pdf_generati')
    .select('id, pdf_url')
    .eq('territorio_id', params.territorioId)
    .eq('activity_id', params.activityId);

  if (params.comune === '') {
    fallbackQuery = fallbackQuery.or('comune.is.null,comune.eq.');
  } else if (params.comune) {
    fallbackQuery = fallbackQuery.eq('comune', params.comune);
  }

  const fallback = await fallbackQuery;
  if (fallback.error) {
    throw new Error(mapSopralluoghiErrorMessage(fallback.error.message));
  }

  return ((fallback.data ?? []) as Array<{ id: number; pdf_url: string | null }>).map((row) => ({
    ...row,
    excel_url: null,
  }));
}

export async function GET() {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const { data, error } = await supabaseAdmin
      .from('sopralluoghi_dataset_caricati')
      .select('*')
      .order('ultimo_caricamento', { ascending: false });

    if (error) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(error.message) }, { status: 500 });
    }

    return NextResponse.json({
      datasets: (data ?? []) as DatasetSummaryRow[],
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: mapSopralluoghiErrorMessage(rawMessage) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const body = (await request.json()) as PatchDatasetPayload;
    const territorioId = String(body.territorio_id ?? '').trim();
    const rawActivityId = body.activity_id != null ? String(body.activity_id).trim() : null;
    const comune = String(body.comune ?? '').trim().toUpperCase();
    const newActivityId = String(body.new_activity_id ?? '').trim();
    const newComune = String(body.new_comune ?? '').trim().toUpperCase();

    if (!territorioId) return NextResponse.json({ error: 'Territorio obbligatorio' }, { status: 400 });
    if (!newActivityId) return NextResponse.json({ error: 'Nuova tipologia lavoro obbligatoria' }, { status: 400 });
    if (!newComune) return NextResponse.json({ error: 'Nuovo comune obbligatorio' }, { status: 400 });

    const newActivity = await requireSopralluoghiActivity(newActivityId);

    const oldActivityNull = !rawActivityId;
    const BATCH = 1000;

    // Fetch IDs da aggiornare in pagine per evitare statement timeout
    let offset = 0;
    for (;;) {
      let selectQuery = supabaseAdmin
        .from('civici_napoli')
        .select('id')
        .eq('territorio_id', territorioId)
        .range(offset, offset + BATCH - 1);

      if (oldActivityNull) {
        selectQuery = selectQuery.is('activity_id', null);
      } else {
        selectQuery = selectQuery.eq('activity_id', rawActivityId!);
      }

      if (comune === '') {
        selectQuery = selectQuery.or('comune.is.null,comune.eq.');
      } else {
        selectQuery = selectQuery.eq('comune', comune);
      }

      const { data: rows, error: selectError } = await selectQuery;
      if (selectError) {
        return NextResponse.json({ error: mapSopralluoghiErrorMessage(selectError.message) }, { status: 500 });
      }
      if (!rows || rows.length === 0) break;

      const ids = rows.map((r: { id: number }) => r.id);
      const { error: updateError } = await supabaseAdmin
        .from('civici_napoli')
        .update({ activity_id: newActivity.id, comune: newComune })
        .in('id', ids);

      if (updateError) {
        return NextResponse.json({ error: mapSopralluoghiErrorMessage(updateError.message) }, { status: 500 });
      }

      if (rows.length < BATCH) break;
      offset += BATCH;
    }

    // Aggiorna anche i PDF generati (pochi record, nessun rischio timeout)
    let pdfUpdateQuery = supabaseAdmin
      .from('sopralluoghi_pdf_generati')
      .update({ activity_id: newActivity.id, comune: newComune })
      .eq('territorio_id', territorioId);

    if (oldActivityNull) {
      pdfUpdateQuery = pdfUpdateQuery.is('activity_id', null);
    } else {
      pdfUpdateQuery = pdfUpdateQuery.eq('activity_id', rawActivityId!);
    }

    if (comune === '') {
      pdfUpdateQuery = pdfUpdateQuery.or('comune.is.null,comune.eq.');
    } else {
      pdfUpdateQuery = pdfUpdateQuery.eq('comune', comune);
    }

    await pdfUpdateQuery;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: mapSopralluoghiErrorMessage(rawMessage) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const body = (await request.json()) as DeleteDatasetPayload;
    const hasComune = Object.prototype.hasOwnProperty.call(body, 'comune');
    const territorioId = String(body.territorio_id ?? '').trim();
    const activityId = String(body.activity_id ?? '').trim();
    const comune = hasComune ? String(body.comune ?? '').trim().toUpperCase() : null;

    if (!territorioId) {
      return NextResponse.json({ error: 'Territorio obbligatorio' }, { status: 400 });
    }

    if (!activityId) {
      return NextResponse.json({ error: 'Tipologia lavoro obbligatoria' }, { status: 400 });
    }

    const activity = await requireSopralluoghiActivity(activityId);

    const { data: territory, error: territoryError } = await supabaseAdmin
      .from('territories')
      .select('id, name')
      .eq('id', territorioId)
      .maybeSingle();

    if (territoryError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(territoryError.message) }, { status: 500 });
    }

    if (!territory) {
      return NextResponse.json({ error: 'Territorio non trovato' }, { status: 404 });
    }

    const pdfRows = await loadGeneratedAssets({
      territorioId,
      activityId: activity.id,
      comune,
    });

    let civiciCountQuery = supabaseAdmin
      .from('civici_napoli')
      .select('id', { count: 'exact', head: true })
      .eq('territorio_id', territorioId)
      .eq('activity_id', activity.id);

    if (comune === '') {
      civiciCountQuery = civiciCountQuery.or('comune.is.null,comune.eq.');
    } else if (comune) {
      civiciCountQuery = civiciCountQuery.eq('comune', comune);
    }

    const { count: civiciCount, error: civiciCountError } = await civiciCountQuery;

    if (civiciCountError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(civiciCountError.message) }, { status: 500 });
    }

    if ((civiciCount ?? 0) === 0 && (pdfRows?.length ?? 0) === 0) {
      return NextResponse.json({ error: 'Nessun dataset trovato per lo scope selezionato' }, { status: 404 });
    }

    let pdfDeleteQuery = supabaseAdmin
      .from('sopralluoghi_pdf_generati')
      .delete()
      .eq('territorio_id', territorioId)
      .eq('activity_id', activity.id);

    if (comune === '') {
      pdfDeleteQuery = pdfDeleteQuery.or('comune.is.null,comune.eq.');
    } else if (comune) {
      pdfDeleteQuery = pdfDeleteQuery.eq('comune', comune);
    }

    const { error: pdfDeleteError } = await pdfDeleteQuery;

    if (pdfDeleteError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(pdfDeleteError.message) }, { status: 500 });
    }

    let civiciDeleteQuery = supabaseAdmin
      .from('civici_napoli')
      .delete()
      .eq('territorio_id', territorioId)
      .eq('activity_id', activity.id);

    if (comune === '') {
      civiciDeleteQuery = civiciDeleteQuery.or('comune.is.null,comune.eq.');
    } else if (comune) {
      civiciDeleteQuery = civiciDeleteQuery.eq('comune', comune);
    }

    const { error: civiciDeleteError } = await civiciDeleteQuery;

    if (civiciDeleteError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(civiciDeleteError.message) }, { status: 500 });
    }

    for (const row of pdfRows ?? []) {
      deletePublicAsset(row.pdf_url);
      deletePublicAsset(row.excel_url);
    }

    return NextResponse.json({
      success: true,
      deleted_scope: {
        territorio_id: territory.id,
        territorio_name: territory.name,
        activity_id: activity.id,
        activity_name: activity.name,
        comune,
      },
      deleted_civici: civiciCount ?? 0,
      deleted_pdfs: pdfRows?.length ?? 0,
      message: `Dataset eliminato: ${datasetScopeLabel({
        territorioName: territory.name,
        activityName: activity.name,
        comune,
      })}`,
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: mapSopralluoghiErrorMessage(rawMessage) }, { status: 500 });
  }
}
