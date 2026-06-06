import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import { buildVoceManuale } from '@/lib/interventi/manuali/buildVoceManuale';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';
import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { nomeFotoFile } from '@/lib/interventi/manuali/fotoNaming';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro'];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // Parsing multipart: la modale invia FormData con `dati` (JSON) e `foto:<slot>` per ogni foto.
  const form = await req.formData();
  const rawDati = JSON.parse(String(form.get('dati') ?? '{}')) as {
    committente?: CommittenteManuale;
    anagrafica?: Record<string, unknown>;
    risposte?: Record<string, unknown>;
    note?: string;
  };

  const committente = rawDati.committente as CommittenteManuale | undefined;
  if (!committente || !COMMITTENTI.includes(committente))
    return NextResponse.json({ error: 'committente_non_valido' }, { status: 400 });

  const anagrafica = rawDati.anagrafica ?? {};
  if (!anagraficaValida(anagrafica))
    return NextResponse.json(
      { error: 'campi_mancanti', dettaglio: 'Indicare almeno un identificativo (PDR, ODL o matricola) e almeno un campo indirizzo (via o comune).' },
      { status: 422 },
    );

  const dati: DatiInterventoManuale = {
    committente,
    anagrafica,
    risposte: rawDati.risposte ?? {},
  };

  // Risolve il template e carica anche i campi (serve per validare le foto obbligatorie).
  const { data: templates } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, committente, is_default, active, campi');
  const templateId = risolviTemplateCommittente(committente, (templates ?? []) as TemplateRow[]);
  if (!templateId) return NextResponse.json({ error: 'template_mancante' }, { status: 409 });

  // Individua i campi foto del template selezionato.
  const templateRow = (templates ?? []).find((t) => t.id === templateId);
  const campiTemplate = ((templateRow as { campi?: unknown })?.campi ?? []) as TemplateCampo[];
  const slotFoto = campiFoto(campiTemplate);

  // Raccoglie le parti file "foto:<slot>" dalla FormData.
  const fileBySlot = new Map<string, File>();
  for (const c of slotFoto) {
    const parte = form.get(`foto:${c.chiave}`);
    if (parte instanceof File && parte.size > 0) fileBySlot.set(c.chiave, parte);
  }

  // Valida le foto obbligatorie → 422 se mancano.
  const esito = validaFotoObbligatorie(campiTemplate, Object.fromEntries(
    slotFoto.map((c) => [c.chiave, fileBySlot.has(c.chiave)]),
  ));
  if (!esito.ok) {
    return NextResponse.json(
      { error: 'Foto obbligatorie mancanti', mancanti: esito.mancanti },
      { status: 422 },
    );
  }

  const { data: req2, error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      rapportino_id: rap.id,
      piano_id: rap.piano_id,
      staff_id: rap.staff_id,
      staff_name: rap.staff_name,
      committente,
      template_id: templateId,
      data: rap.data,
      dati_operatore: dati,
      dati_correnti: dati,
      note: rawDati.note ?? null,
      stato: 'in_attesa',
      corsia: 'normale',
    })
    .select('id')
    .single();
  if (eReq) return NextResponse.json({ error: eReq.message }, { status: 500 });

  const { data: maxRow } = await supabaseAdmin
    .from('rapportino_voci')
    .select('ordine')
    .eq('rapportino_id', rap.id)
    .order('ordine', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordine = ((maxRow?.ordine as number | undefined) ?? 0) + 1;

  const voce = buildVoceManuale({ rapportinoId: rap.id, richiestaId: req2!.id, ordine, dati });
  const { data: voceRow, error: eVoce } = await supabaseAdmin
    .from('rapportino_voci')
    .insert(voce)
    .select('id')
    .single();
  if (eVoce) return NextResponse.json({ error: eVoce.message }, { status: 500 });

  await supabaseAdmin.from('interventi_manuali').update({ voce_id: voceRow!.id }).eq('id', req2!.id);

  // Upload foto e creazione record interventi_manuali_foto (dopo aver ottenuto req2.id).
  const ids = {
    pdr: anagrafica.pdr as string | undefined,
    matricola: anagrafica.matricola as string | undefined,
    odl: anagrafica.odl as string | undefined,
    indirizzo: anagrafica.indirizzo as string | undefined,
  };

  for (const c of slotFoto) {
    const f = fileBySlot.get(c.chiave);
    if (!f) continue; // slot facoltativo non compilato

    const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase();
    const storagePath = `${req2!.id}/${c.chiave}_${req2!.id}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });
    if (upErr) {
      return NextResponse.json({ error: `Upload foto fallito: ${upErr.message}` }, { status: 502 });
    }

    const { error: insErr } = await supabaseAdmin.from('interventi_manuali_foto').insert({
      richiesta_id: req2!.id,
      slot_chiave: c.chiave,
      slot_etichetta: c.etichetta,
      storage_path: storagePath,
      file_name: nomeFotoFile(c.etichetta, ids, ext),
      mime_type: f.type || 'image/jpeg',
      size: f.size,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id });
}
