import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { richiestaIdValido } from '@/lib/offline/idRichiesta';
import { risolviTemplateCommittente, type TemplateRow } from '@/lib/interventi/manuali/risolviTemplateCommittente';
import { buildVoceManuale } from '@/lib/interventi/manuali/buildVoceManuale';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';
import { anagraficaValida } from '@/lib/interventi/manuali/anagraficaValida';
import { esitoPositivoDefault } from '@/lib/interventi/manuali/esitoPositivoDefault';
import { attivitaDefaultManuale } from '@/lib/interventi/manuali/attivitaPerCommittente';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { risolviCampiManuali } from '@/lib/interventi/manuali/risolviCampiManuali';
import { partiFotoRicevute, etichettaSlotFoto } from '@/lib/interventi/manuali/fotoRicevute';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { nomeFotoFile, identificativoFoto, type FotoIdCampo } from '@/lib/interventi/manuali/fotoNaming';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { decisioneCorsia } from '@/lib/interventi/manuali/decisioneCorsia';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import { normMatricola } from '@/lib/limitazione/matricoleSimili';

export const runtime = 'nodejs';

const COMMITTENTI: CommittenteManuale[] = ['acea', 'italgas', 'altro', 'lim_massive'];

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, staff_id, staff_name, data, piano_id, stato, riaperto_at, template_id')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // Parsing multipart: la modale invia FormData con `dati` (JSON) e `foto:<slot>` per ogni foto.
  const form = await req.formData();
  const rawDati = JSON.parse(String(form.get('dati') ?? '{}')) as {
    richiestaId?: string;
    committente?: CommittenteManuale;
    anagrafica?: Record<string, unknown>;
    risposte?: Record<string, unknown>;
    note?: string;
  };

  const committente = rawDati.committente as CommittenteManuale | undefined;
  if (!committente || !COMMITTENTI.includes(committente))
    return NextResponse.json({ error: 'committente_non_valido' }, { status: 400 });

  const anagrafica = rawDati.anagrafica ?? {};
  if (!anagraficaValida(anagrafica, committente))
    return NextResponse.json(
      { error: 'campi_mancanti', dettaglio: 'Indicare almeno un identificativo (PDR, ODL o matricola) e almeno un campo indirizzo (via o comune).' },
      { status: 422 },
    );

  // Attività di default per committente (es. lim_massive → "LIMITAZIONI MASSIVE"): il personale
  // non la scrive. Autorevole anche per l'offline (stesso payload ri-giocato qui). Solo se vuota.
  const attivitaDefault = attivitaDefaultManuale(committente);
  if (attivitaDefault && !String((anagrafica as { attivita?: unknown }).attivita ?? '').trim()) {
    (anagrafica as { attivita?: string }).attivita = attivitaDefault;
  }

  const dati: DatiInterventoManuale = {
    committente,
    anagrafica,
    risposte: rawDati.risposte ?? {},
  };

  // Risolve il template e carica anche i campi (serve per validare le foto obbligatorie).
  const { data: templates } = await supabaseAdmin
    .from('rapportino_template')
    .select('id, committente, is_default, active, campi, solo_manuale, foto_id_priority')
    .eq('solo_manuale', true);
  const templateId = risolviTemplateCommittente(committente, (templates ?? []) as TemplateRow[]);
  if (!templateId) return NextResponse.json({ error: 'template_mancante' }, { status: 409 });

  // Override = campi del template solo_manuale del committente.
  const templateRow = (templates ?? []).find((t) => t.id === templateId);
  const overrideCampi = ((templateRow as { campi?: unknown })?.campi ?? []) as TemplateCampo[];

  // Standard = campi del template del rapportino, letti LIVE (eredità come il client:
  // override vuoto → si eredita lo standard). È questo allineamento che evita di scartare
  // le foto quando il template manuale è vuoto/sballato.
  let standardCampi: TemplateCampo[] = [];
  let standardPriority: FotoIdCampo[] = [];
  if (rap.template_id) {
    const { data: tplStd } = await supabaseAdmin
      .from('rapportino_template')
      .select('campi, foto_id_priority')
      .eq('id', rap.template_id)
      .maybeSingle();
    if (tplStd) {
      standardCampi = ((tplStd.campi ?? []) as TemplateCampo[]);
      standardPriority = ((tplStd.foto_id_priority ?? []) as FotoIdCampo[]);
    }
  }
  const ereditaStandard = !(overrideCampi.length > 0);
  const campiEffettivi = risolviCampiManuali(overrideCampi, standardCampi);
  const slotFoto = campiFoto(campiEffettivi);

  // Gli interventi dal "+" sono sempre a esito positivo: se non valorizzato, imposta
  // `eseguito` all'opzione positiva del template (così la colonna Eseguito si popola e i
  // conteggi si allineano). Vale anche per il ramo offline (stesso payload ri-giocato qui).
  dati.risposte = esitoPositivoDefault(campiEffettivi, dati.risposte);

  // Raccoglie TUTTE le parti "foto:<chiave>" ricevute (anche slot non previsti dal
  // template): il server non scarta mai una foto. La validazione obbligatorie resta
  // sui campi effettivi.
  const received = partiFotoRicevute(form);

  // Valida le foto obbligatorie → 422 se mancano.
  const presentiSet = new Set(received.map((r) => r.chiave));
  const esito = haEsitoNegativo(dati.risposte, campiEffettivi)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(campiEffettivi, Object.fromEntries(
        slotFoto.map((c) => [c.chiave, presentiSet.has(c.chiave)]),
      ));
  if (!esito.ok) {
    return NextResponse.json(
      { error: 'Foto obbligatorie mancanti', mancanti: esito.mancanti },
      { status: 422 },
    );
  }

  // === C1: genera l'id richiesta in anticipo e carica TUTTE le foto prima di qualsiasi INSERT DB ===

  // Idempotenza: se il client fornisce un richiestaId già esistente (re-invio offline),
  // restituisci il risultato esistente senza re-inserire.
  if (richiestaIdValido(rawDati.richiestaId)) {
    const { data: esistente } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, voce_id, corsia, intervento_id')
      .eq('id', rawDati.richiestaId)
      .maybeSingle();
    if (esistente) {
      return NextResponse.json({
        id: esistente.id,
        voceId: esistente.voce_id,
        corsia: esistente.corsia,
        interventoId: esistente.intervento_id,
        idempotente: true,
      });
    }
  }

  const richiestaId = richiestaIdValido(rawDati.richiestaId) ? rawDati.richiestaId : randomUUID();

  const ids = {
    pdr: anagrafica.pdr as string | undefined,
    matricola: anagrafica.matricola as string | undefined,
    odl: anagrafica.odl as string | undefined,
    indirizzo: anagrafica.via as string | undefined,
  };

  const fotoPriority = ereditaStandard
    ? standardPriority
    : (((templateRow as { foto_id_priority?: string[] | null } | undefined)?.foto_id_priority ?? []) as FotoIdCampo[]);

  // I2: check MIME server-side per ogni foto prima dell'upload.
  for (const { file } of received) {
    if (!file.type.startsWith('image/'))
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

  for (const { chiave, file: f } of received) {
    const ext = (f.name.split('.').pop() ?? 'jpg').toLowerCase();
    // I1: storage_path usa identificativoFoto, non l'UUID della richiesta.
    const storagePath = `${richiestaId}/${chiave}_${identificativoFoto(ids, fotoPriority)}.${ext}`;
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

    // Etichetta dal template effettivo se nota, altrimenti la chiave (mai scartare).
    const etichetta = etichettaSlotFoto(chiave, campiEffettivi);
    pathCaricati.push(storagePath);
    fotoCaricate.push({
      storagePath,
      chiave,
      etichetta,
      fileName: nomeFotoFile(etichetta, ids, ext, fotoPriority),
      mimeType: f.type || 'image/jpeg',
      size: f.size,
    });
  }

  // === Solo se TUTTE le foto sono caricate: INSERT DB ===

  // Corsia per (piano, operatore): se 'liberi', la richiesta salta l'approvazione.
  let corsia: 'normale' | 'liberi' = 'normale';
  if (rap.piano_id && rap.staff_id) {
    const { data: lock } = await supabaseAdmin
      .from('mappa_piani_lucchetti')
      .select('manuali_liberi')
      .eq('piano_id', rap.piano_id)
      .eq('staff_id', rap.staff_id)
      .maybeSingle();
    corsia = decisioneCorsia(lock as { manuali_liberi?: boolean | null } | null);
  }

  // Ramo liberi: crea subito l'intervento canonico (origine='manuale').
  let interventoId: string | null = null;
  if (corsia === 'liberi') {
    const record = richiestaToIntervento(dati, {
      committente: committente as CommittenteManuale,
      data: rap.data as string,
      staff_id: String(rap.staff_id ?? ''),
      piano_id: (rap.piano_id as string | null) ?? null,
    });
    const { data: intRow, error: eInt } = await supabaseAdmin
      .from('interventi')
      .insert(record)
      .select('id')
      .single();
    if (eInt) {
      // Rollback storage se la creazione intervento fallisce.
      if (pathCaricati.length > 0) {
        await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      }
      return NextResponse.json({ error: eInt.message }, { status: 500 });
    }
    interventoId = intRow!.id;
  }

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
      stato: corsia === 'liberi' ? 'auto_liberi' : 'in_attesa',
      corsia,
      intervento_id: interventoId,
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
  if (eVoce) {
    // Rollback best-effort: storage + richiesta DB (+ intervento se corsia liberi).
    try {
      if (pathCaricati.length > 0) {
        await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
      }
      await supabaseAdmin.from('interventi_manuali').delete().eq('id', req2!.id);
      if (corsia === 'liberi' && interventoId) {
        await supabaseAdmin.from('interventi').delete().eq('id', interventoId);
      }
    } catch {
      // cleanup fallito: non mascheriamo l'errore originale
    }
    return NextResponse.json({ error: eVoce.message }, { status: 500 });
  }

  await supabaseAdmin.from('interventi_manuali').update({ voce_id: voceRow!.id }).eq('id', req2!.id);

  // Ramo liberi: la voce nasce approvata e già agganciata all'intervento canonico.
  if (corsia === 'liberi' && interventoId) {
    await supabaseAdmin
      .from('rapportino_voci')
      .update({ approvazione_stato: 'approvato', intervento_id: interventoId })
      .eq('id', voceRow!.id);
  }

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
      // Rollback best-effort: storage + foto parziali + voce + richiesta (+ intervento se liberi).
      try {
        if (pathCaricati.length > 0) {
          await supabaseAdmin.storage.from('interventi-foto').remove(pathCaricati);
        }
        await supabaseAdmin.from('rapportino_voci').delete().eq('id', voceRow!.id);
        await supabaseAdmin.from('interventi_manuali').delete().eq('id', req2!.id);
        if (corsia === 'liberi' && interventoId) {
          await supabaseAdmin.from('interventi').delete().eq('id', interventoId);
        }
      } catch {
        // cleanup fallito: non mascheriamo l'errore originale
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // === Sostituzione del rifiutato ===
  // Se per questa matricola esisteva, nello stesso rapportino, una richiesta RIFIUTATA,
  // la rimuoviamo (voce + richiesta + foto) così resta UNA sola riga, quella appena
  // creata, che torna "in attesa". Best-effort: non fa fallire la nuova richiesta.
  const matricolaNuova = normMatricola(anagrafica.matricola);
  if (matricolaNuova) {
    try {
      const { data: vociRifiutate } = await supabaseAdmin
        .from('rapportino_voci')
        .select('id, matricola, richiesta_id')
        .eq('rapportino_id', rap.id)
        .eq('manuale', true)
        .eq('approvazione_stato', 'rifiutato');
      const daRimuovere = ((vociRifiutate ?? []) as Array<{ id: string; matricola: string | null; richiesta_id: string | null }>)
        .filter((rv) => rv.id !== voceRow!.id && normMatricola(rv.matricola) === matricolaNuova);
      for (const rv of daRimuovere) {
        if (rv.richiesta_id) {
          const { data: fotoRows } = await supabaseAdmin
            .from('interventi_manuali_foto')
            .select('storage_path')
            .eq('richiesta_id', rv.richiesta_id);
          const paths = ((fotoRows ?? []) as Array<{ storage_path: string }>).map((f) => f.storage_path);
          if (paths.length > 0) await supabaseAdmin.storage.from('interventi-foto').remove(paths);
          await supabaseAdmin.from('interventi_manuali_foto').delete().eq('richiesta_id', rv.richiesta_id);
          await supabaseAdmin.from('interventi_manuali').delete().eq('id', rv.richiesta_id);
        }
        await supabaseAdmin.from('rapportino_voci').delete().eq('id', rv.id);
      }
    } catch (e) {
      console.error('[intervento-manuale] sostituzione rifiutato fallita:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ id: req2!.id, voceId: voceRow!.id, corsia, interventoId });
}
