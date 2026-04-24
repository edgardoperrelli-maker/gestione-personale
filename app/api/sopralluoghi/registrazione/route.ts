import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { mapSopralluoghiErrorMessage, requireSopralluoghiAdmin } from '../_helpers';

export const dynamic = 'force-dynamic';

type RegistrationDraft = {
  civico_id: number;
  visitato: boolean;
  idoneo: boolean;
  punti_gas?: number | string | null;
  note: string;
};

type RegistrationPayload = {
  territorio_id?: string | null;
  microarea?: string | null;
  data_sopralluogo?: string | null;
  drafts?: RegistrationDraft[];
};

type ExistingSopralluogo = {
  civico_id: number;
  stato: 'da_visitare' | 'visitato' | 'programmato';
  idoneo_risanamento: boolean | null;
  punti_gas: number | null;
  note: string | null;
};

type CivicoRow = {
  id: number;
  odonimo: string;
  civico: string;
  microarea: string;
};

function normalizeDate(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return new Date().toISOString().slice(0, 10);
}

function parsePuntiGas(value: number | string | null | undefined): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('PG deve essere un numero intero uguale o maggiore di zero.');
  }

  return parsed;
}

async function loadCiviciAndRegistrazioni(params: {
  territorioId: string;
  microarea: string;
}) {
  const { territorioId, microarea } = params;

  const { data: civici, error: civiciError } = await supabaseAdmin
    .from('civici_napoli')
    .select('id, odonimo, civico, microarea')
    .eq('territorio_id', territorioId)
    .eq('microarea', microarea)
    .order('odonimo', { ascending: true })
    .order('civico', { ascending: true });

  if (civiciError) {
    throw new Error(mapSopralluoghiErrorMessage(civiciError.message));
  }

  const civiciRows = (civici ?? []) as CivicoRow[];
  if (civiciRows.length === 0) {
    return {
      civici: [],
      sopralluoghi: [],
    };
  }

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from('sopralluoghi')
    .select('civico_id, stato, idoneo_risanamento, punti_gas, note')
    .in('civico_id', civiciRows.map((civico) => civico.id));

  if (existingError) {
    throw new Error(mapSopralluoghiErrorMessage(existingError.message));
  }

  return {
    civici: civiciRows,
    sopralluoghi: (existingRows ?? []) as ExistingSopralluogo[],
  };
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const searchParams = new URL(request.url).searchParams;
    const territorioId = String(searchParams.get('territorio_id') ?? '').trim();
    const microarea = String(searchParams.get('microarea') ?? '').trim();

    if (!territorioId) {
      return NextResponse.json({ error: 'Territorio obbligatorio' }, { status: 400 });
    }

    if (!microarea) {
      return NextResponse.json({ error: 'Microarea obbligatoria' }, { status: 400 });
    }

    const data = await loadCiviciAndRegistrazioni({
      territorioId,
      microarea,
    });

    return NextResponse.json(data);
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = mapSopralluoghiErrorMessage(rawMessage);
    console.error('Errore caricamento registrazione sopralluoghi:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireSopralluoghiAdmin();
    if (guard instanceof NextResponse) return guard;

    const body = (await request.json()) as RegistrationPayload;
    const territorioId = String(body.territorio_id ?? '').trim();
    const microarea = String(body.microarea ?? '').trim();
    const drafts = Array.isArray(body.drafts) ? body.drafts : [];

    if (!territorioId) {
      return NextResponse.json({ error: 'Territorio obbligatorio' }, { status: 400 });
    }

    if (!microarea) {
      return NextResponse.json({ error: 'Microarea obbligatoria' }, { status: 400 });
    }

    if (drafts.length === 0) {
      return NextResponse.json({ error: 'Nessun dato da registrare' }, { status: 400 });
    }

    const { civici } = await loadCiviciAndRegistrazioni({
      territorioId,
      microarea,
    });

    if (civici.length === 0) {
      return NextResponse.json({ error: 'Nessun civico trovato per territorio e microarea selezionati' }, { status: 404 });
    }

    const validCivicoIds = new Set(civici.map((civico) => civico.id));

    const normalizedDrafts = drafts
      .map((draft) => {
        const visitato = Boolean(draft.visitato);
        const idoneo = visitato && Boolean(draft.idoneo);

        return {
          civico_id: Number(draft.civico_id),
          visitato,
          idoneo,
          punti_gas: idoneo ? parsePuntiGas(draft.punti_gas) : null,
          note: String(draft.note ?? '').trim(),
        };
      })
      .filter((draft) => Number.isInteger(draft.civico_id) && validCivicoIds.has(draft.civico_id));

    if (normalizedDrafts.length === 0) {
      return NextResponse.json({ error: 'I civici inviati non appartengono alla selezione corrente' }, { status: 400 });
    }

    const dataSopralluogo = normalizeDate(body.data_sopralluogo);
    const visitedDrafts = normalizedDrafts.filter((draft) => draft.visitato);
    const visitedIds = new Set(visitedDrafts.map((draft) => draft.civico_id));

    const { data: existingRows, error: existingError } = await supabaseAdmin
      .from('sopralluoghi')
      .select('civico_id, stato')
      .in('civico_id', normalizedDrafts.map((draft) => draft.civico_id));

    if (existingError) {
      return NextResponse.json({ error: mapSopralluoghiErrorMessage(existingError.message) }, { status: 500 });
    }

    const existing = (existingRows ?? []) as Pick<ExistingSopralluogo, 'civico_id' | 'stato'>[];
    const toDeleteIds = existing
      .filter((row) => row.stato === 'visitato' && !visitedIds.has(row.civico_id))
      .map((row) => row.civico_id);

    if (visitedDrafts.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('sopralluoghi')
        .upsert(
          visitedDrafts.map((draft) => ({
            civico_id: draft.civico_id,
            territorio_id: territorioId,
            data_sopralluogo: dataSopralluogo,
            operatore_user_id: guard.userId,
            stato: 'visitato' as const,
            idoneo_risanamento: draft.idoneo,
            punti_gas: draft.punti_gas,
            note: draft.note || null,
            created_by: guard.userId,
          })),
          { onConflict: 'civico_id' },
        );

      if (upsertError) {
        return NextResponse.json({ error: mapSopralluoghiErrorMessage(upsertError.message) }, { status: 500 });
      }
    }

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('sopralluoghi')
        .delete()
        .in('civico_id', toDeleteIds);

      if (deleteError) {
        return NextResponse.json({ error: mapSopralluoghiErrorMessage(deleteError.message) }, { status: 500 });
      }
    }

    if (visitedDrafts.length > 0) {
      await supabaseAdmin
        .from('sopralluoghi_pdf_generati')
        .update({ stato_registrazione: 'completato' })
        .eq('territorio_id', territorioId)
        .eq('microarea', microarea)
        .neq('stato_registrazione', 'completato');
    }

    const puntiGasTotali = visitedDrafts.reduce(
      (sum, draft) => sum + (draft.idoneo ? draft.punti_gas ?? 0 : 0),
      0,
    );

    return NextResponse.json({
      success: true,
      salvati: visitedDrafts.length,
      rimossi: toDeleteIds.length,
      punti_gas_totali: puntiGasTotali,
      microarea,
      territorio_id: territorioId,
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = mapSopralluoghiErrorMessage(rawMessage);
    console.error('Errore registrazione sopralluoghi:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
