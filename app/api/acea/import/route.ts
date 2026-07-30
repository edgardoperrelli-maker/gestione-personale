import 'server-only';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseExportAcea } from '@/lib/acea/parseExportAcea';
import { riconciliaImport, type AnnullatoPianificato } from '@/lib/acea/riconciliaImport';
import { applicaImport } from '@/lib/acea/applicaImport';
import { ricalcolaGruppi, type EsitoGruppi } from '@/lib/acea/gruppiServer';
import { isAnnullato } from '@/lib/acea/statiOrdine';
import { daPotare, type ImportArchiviato } from '@/lib/acea/retentionArchivio';
import { partiRoma } from '@/lib/agente/orarioRoma';
import type { RigaOrdineAcea } from '@/lib/acea/tipi';

export const runtime = 'nodejs';
// L'export completo è ~1,4 MB per 5.293 righe: parsing e scritture stanno dentro il minuto,
// ma il default di Vercel (10s su alcune configurazioni) sarebbe stretto.
export const maxDuration = 300;

const BUCKET = 'acea-import';
const PAGINA = 1000;

/**
 * Retention dell'archivio: pota dal bucket gli xlsx che hanno esaurito il loro compito.
 *
 * Corre a valle di ogni import riuscito — il bucket cresce solo lì, quindi è anche l'unico
 * momento in cui serve potare. Rimuove il file e AZZERA `storage_path` sulla riga di
 * `acea_import`: i metadati e il change-log restano per sempre, è solo il file grezzo a uscire.
 * Best-effort come l'archiviazione stessa: un import scritto non deve fallire per una pulizia.
 */
async function potaArchivio(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('acea_import')
    .select('id, caricato_il, storage_path')
    .not('storage_path', 'is', null);
  if (error) throw error;

  const scelti = daPotare((data ?? []) as ImportArchiviato[], partiRoma(new Date()).oggi);
  if (scelti.length === 0) return 0;

  // Prima il bucket, poi il puntatore: se la rimozione fallisce, `storage_path` resta vero e il
  // prossimo import ci riprova. L'ordine inverso lascerebbe file orfani che nessuno pota più.
  const percorsi = scelti.map((s) => s.storage_path).filter((p): p is string => Boolean(p));
  for (let i = 0; i < percorsi.length; i += 100) {
    const { error: eRm } = await supabaseAdmin.storage.from(BUCKET).remove(percorsi.slice(i, i + 100));
    if (eRm) throw eRm;
  }
  for (let i = 0; i < scelti.length; i += 200) {
    const blocco = scelti.slice(i, i + 200).map((s) => s.id);
    const { error: eUp } = await supabaseAdmin
      .from('acea_import')
      .update({ storage_path: null })
      .in('id', blocco);
    if (eUp) throw eUp;
  }
  return scelti.length;
}

/** Carica l'intero registro (PostgREST tronca a 1000 righe per chiamata). */
async function caricaRegistro(): Promise<RigaOrdineAcea[]> {
  const out: RigaOrdineAcea[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('*')
      .order('odl', { ascending: true })
      .order('numero_operazione', { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    const righe = (data ?? []) as RigaOrdineAcea[];
    out.push(...righe);
    if (righe.length < PAGINA) break;
  }
  return out;
}

/**
 * Interventi già pianificati sugli ordini che stanno per essere annullati.
 * Servono a NON cancellare in silenzio il lavoro di qualcuno: finiscono nel riepilogo.
 */
async function caricaPianificatiPerAnnullati(
  annullati: readonly RigaOrdineAcea[],
): Promise<AnnullatoPianificato[]> {
  if (annullati.length === 0) return [];
  const odlAnnullati = [...new Set(annullati.map((r) => r.odl))];
  const out: AnnullatoPianificato[] = [];
  // `in` con liste molto lunghe fa esplodere la query string: si va a blocchi.
  for (let i = 0; i < odlAnnullati.length; i += 200) {
    const blocco = odlAnnullati.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from('interventi')
      .select('odl, data, staff_id, stato')
      .in('odl', blocco)
      .not('stato', 'in', '("completato","annullato")');
    if (error) throw error;
    for (const i2 of (data ?? []) as Array<{ odl: string | null; data: string | null; staff_id: string | null }>) {
      if (!i2.odl) continue;
      // `interventi` non porta il numero operazione: si segnalano tutte le operazioni dell'ordine.
      for (const a of annullati.filter((x) => x.odl === i2.odl)) {
        out.push({
          odl: a.odl,
          numero_operazione: a.numero_operazione,
          data: i2.data,
          operatore: i2.staff_id,
        });
      }
    }
  }
  return out;
}

/**
 * POST /api/acea/import — carica un export del Cruscotto ACEA nel registro.
 *
 * multipart/form-data: `file` (xlsx), `conferma` ('1' per riprocessare un file già importato).
 *
 * Regole (studio di fattibilità §5): il file è sempre il totale; una riga identica viene saltata;
 * gli ordini annullati escono dal registro; l'assenza dal file NON cancella nulla.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const form = await req.formData();
    const file = form.get('file');
    const conferma = String(form.get('conferma') ?? '') === '1';
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File mancante (campo "file").' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash('sha256').update(buffer).digest('hex');

    // 1) Idempotenza visibile: se il file è già passato, lo si dice invece di rifare il giro
    // in silenzio. Con più admin che caricano, evita il "l'ha già fatto il collega?".
    const { data: giaImportato } = await supabaseAdmin
      .from('acea_import')
      .select('id, nome_file, caricato_il, caricato_da, righe_totali')
      .eq('sha256', sha256)
      .maybeSingle();
    if (giaImportato && !conferma) {
      return NextResponse.json(
        { error: 'file_gia_importato', precedente: giaImportato },
        { status: 409 },
      );
    }

    // 2) Parsing + validazioni (formato, contratto, fornitore): niente scritture se non torna.
    const parse = await parseExportAcea(buffer);
    if (!parse.ok) {
      return NextResponse.json({ error: parse.motivo, dettagli: parse.dettagli }, { status: 422 });
    }

    // 3) Riconciliazione contro il registro corrente.
    const esistenti = await caricaRegistro();
    const annullatiNelFile = parse.righe.filter((r) => isAnnullato(r.stato));
    const pianificati = await caricaPianificatiPerAnnullati(annullatiNelFile);
    const piano = riconciliaImport({ dalFile: parse.righe, esistenti, pianificati });

    // 4) Riga di import creata PRIMA della scrittura: serve l'id per marcare righe ed eventi,
    // e se qualcosa va storto resta la traccia del tentativo.
    const { data: imp, error: eImp } = await supabaseAdmin
      .from('acea_import')
      .insert({
        sha256,
        nome_file: file.name,
        righe_totali: parse.righe.length,
        finestra_dal: parse.finestra.dal,
        finestra_al: parse.finestra.al,
        caricato_da: auth.user.id,
        esito: { stato: 'in_corso' },
      })
      .select('id')
      .single();
    if (eImp || !imp) throw eImp ?? new Error('Impossibile registrare l\'import.');
    const importId = imp.id as string;

    // 5) Scrittura.
    const scritture = await applicaImport(supabaseAdmin, piano, importId);

    // 5-bis) Microaree: gli ordini nuovi arrivano senza coordinate, e geocodificarli richiede
    // minuti (un indirizzo al secondo). Il ricalcolo presta loro il gruppo del CAP — a Roma — o del
    // comune, così una riga appena importata ha già una zona invece di restare a «—» proprio nei
    // giorni in cui la si pianifica. Il numero prestato resta marcato come stimato.
    //
    // Best-effort come l'archiviazione: un import scritto correttamente non deve fallire perché la
    // rinumerazione è andata storta. Il pulsante negli Strumenti la rifà quando serve.
    let gruppi: EsitoGruppi | null = null;
    try {
      gruppi = await ricalcolaGruppi();
    } catch (e) {
      console.warn('[acea/import] ricalcolo microaree non riuscito:', e);
    }

    // 6) Archiviazione dell'originale: best-effort, non deve invalidare un import riuscito.
    let storagePath: string | null = null;
    try {
      const nome = `${new Date().toISOString().slice(0, 10)}/${sha256.slice(0, 12)}-${file.name}`;
      const { error: eUp } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(nome, buffer, {
          contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      if (!eUp) storagePath = nome;
    } catch {
      /* l'archiviazione è tracciabilità, non correttezza */
    }

    // 6-bis) Retention dell'archivio: si pota qui perché è qui che il bucket cresce.
    let archivioPotati = 0;
    try {
      archivioPotati = await potaArchivio();
      if (archivioPotati > 0) {
        console.info(`[acea/import] archivio potato: ${archivioPotati} file oltre la retention`);
      }
    } catch (e) {
      console.warn('[acea/import] retention archivio non riuscita:', e);
    }

    const riepilogo = {
      importId,
      finestra: parse.finestra,
      righeFile: parse.righe.length,
      nuove: piano.nuove.length,
      modificate: piano.modificate.length,
      invariate: piano.invariate,
      annullateRimosse: piano.daEliminare.length,
      nonCoperte: piano.nonCoperte,
      annullatiPianificati: piano.annullatiPianificati,
      avvisi: parse.avvisi,
      scritture,
      archiviato: storagePath !== null,
      archivioPotati,
      microaree: gruppi,
    };

    await supabaseAdmin
      .from('acea_import')
      .update({
        storage_path: storagePath,
        righe_nuove: piano.nuove.length,
        righe_modificate: piano.modificate.length,
        righe_invariate: piano.invariate,
        righe_annullate: piano.daEliminare.length,
        esito: { stato: scritture.errore ? 'errore' : 'ok', ...riepilogo },
      })
      .eq('id', importId);

    if (scritture.errore) {
      return NextResponse.json({ error: scritture.errore, riepilogo }, { status: 500 });
    }
    return NextResponse.json(riepilogo, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore import ACEA.' },
      { status: 500 },
    );
  }
}

/** GET /api/acea/import — storico degli import (ultimi 20), per la scheda del modulo. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin
    .from('acea_import')
    .select('id, nome_file, sha256, righe_totali, righe_nuove, righe_modificate, righe_invariate, righe_annullate, finestra_dal, finestra_al, caricato_da, caricato_il')
    .order('caricato_il', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
}
