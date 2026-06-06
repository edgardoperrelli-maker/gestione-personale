import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import { buildVoceManuale } from '@/lib/interventi/manuali/buildVoceManuale';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';
import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { nomeFotoFile, identificativoFoto } from '@/lib/interventi/manuali/fotoNaming';
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

  // === C1: genera l'id richiesta in anticipo e carica TUTTE le foto prima di qualsiasi INSERT DB ===
  const richiestaId = randomUUID();

  const ids = {
    pdr: anagrafica.pdr as string | undefined,
    matricola: anagrafica.matricola as string | undefined,
    odl: anagrafica.odl as string | undefined,
    indirizzo: anagrafica.indirizzo as string | undefined,
  };

  // I2: check MIME server-side per ogni foto prima dell'upload.
  for (const [, f] of fileBySlot) {
    if (!f.type.startsWith('image/'))
      return NextResponse.json({ error: 'tipo_file_non_valido' }, { status: 400 });
  }

  // Fase upload: carica tutte le foto (con storage_path definitivo), accumula i path.
  type FotoCaricata = {
    storagePath: string;
    chiave: string;
    etichetta: string;
    fileName: string;
    mimeType: string;
    size: number;
  };

  const fotoCaricate: FotoCaricata[] = [];
  const pathCaricati: string[] = [];

  for (const c of slotFoto) {
    const f = fileBySlot.get(c.chiave);
    if (!f) continue; // slot facoltativo non compilato

    const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase();
    // I1: storage_path usa identificativoFoto, non l'UUID della richiesta.
    const storagePath = `${richiestaId}/${c.chiave}_${identificativoFoto(ids)}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from('interventi-foto')
      .upload(storagePath, buf, { contentType: f.type || 'image/jpeg', upsert: true });

    if (upErr) {
      // Rollback: elimina i file già caricati prima di rispondere con errore.
      if (pathCaricati.length > 0) {
        await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      }
      return NextResponse.json({ error: 'upload_foto_fallito' }, { status: 502 });
    }

    pathCaricati.push(storagePath);
    fotoCaricate.push({
      storagePath,
      chiave: c.chiave,
      etichetta: c.etichetta,
      fileName: nomeFotoFile(c.etichetta, ids, ext),
      mimeType: f.type || 'image/jpeg',
      size: f.size,
    });
  }

  // === Solo se TUTTE le foto sono caricate: INSERT DB ===
  const { data: req2, error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .insert({
      id: richiestaId,
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
  if (eReq) {
    // Rollback storage se l'INSERT DB fallisce.
    if (pathCaricati.length > 0) {
      await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
    }
    return NextResponse.json({ error: eReq.message }, { status: 500 });
  }

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

  // INSERT record foto (con path già caricati in storage).
  for (const foto of fotoCaricate) {
    const { error: insErr } = await supabaseAdmin.from('interventi_manuali_foto').insert({
      richiesta_id: req2!.id,
      slot_chiave: foto.chiave,
      slot_etichetta: foto.etichetta,
      storage_path: foto.storagePath,
      file_name: foto.fileName,
      mime_type: foto.mimeType,
      size: foto.size,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id });
}
