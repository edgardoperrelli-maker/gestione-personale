import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parseExcelToTasks } from '@/utils/routing/excelParser';
import { requireUser } from '@/lib/apiAuth';
import type { Task } from '@/utils/routing/types';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex } from '@/lib/attivita/tassonomia';
import { validaImport } from '@/lib/attivita/validaImport';

export const runtime = 'nodejs';

const COMMITTENTI = ['acea', 'italgas', 'altro'] as const;
type Committente = (typeof COMMITTENTI)[number];

/** Stringa normalizzata: trim, null se vuota. */
function nrm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Campi descrittivi mappati da un Task dell'Excel a una riga `interventi`. */
function taskToDescrittivi(t: Task, extra?: { descrizioneCanonica: string; gruppo: string }) {
  return {
    odl: nrm(t.odl),
    pdr: nrm(t.pdr),
    nominativo: nrm(t.nominativo),
    matricola_contatore: nrm(t.matricola),
    indirizzo: nrm(t.indirizzo),
    comune: nrm(t.citta),
    cap: nrm(t.cap),
    fascia_oraria: nrm(t.fascia_oraria),
    codice_servizio: nrm(t.codice),
    intervento_tipo: extra ? extra.descrizioneCanonica : nrm(t.attivita),
    gruppo_attivita: extra ? extra.gruppo : null,
    lat: typeof t.lat === 'number' ? t.lat : null,
    lng: typeof t.lng === 'number' ? t.lng : null,
  };
}

/**
 * POST /api/interventi/import — importa un Excel di interventi in `interventi`.
 *
 * multipart/form-data: `file` (xlsx), `committente` (acea|italgas|altro),
 * `data` (YYYY-MM-DD, giorno di lavoro del batch), `lotto` (opzionale 1|2|3).
 *
 * Italgas riusa il formato ATTGIORN già gestito da `parseExcelToTasks`.
 * Dedup per `(committente, odl, data)`: le righe con `odl` già presente vengono
 * aggiornate nei soli campi descrittivi (assegnazione e stato preservati); le
 * nuove vengono inserite con stato `da_assegnare`.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;

    const form = await req.formData();
    const file = form.get('file');
    const committente = (nrm(form.get('committente')) ?? 'italgas') as Committente;
    const data = nrm(form.get('data'));
    const lottoRaw = nrm(form.get('lotto'));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File Excel mancante (campo "file").' }, { status: 400 });
    }
    if (!COMMITTENTI.includes(committente)) {
      return NextResponse.json({ error: `committente non valido (${COMMITTENTI.join('|')}).` }, { status: 400 });
    }
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: 'Campo "data" obbligatorio (YYYY-MM-DD).' }, { status: 400 });
    }
    const lotto = lottoRaw && /^[123]$/.test(lottoRaw) ? Number(lottoRaw) : null;

    let tasks: Task[];
    try {
      tasks = await parseExcelToTasks(file);
    } catch (e) {
      return NextResponse.json(
        { error: `Excel non leggibile: ${e instanceof Error ? e.message : 'formato non riconosciuto'}` },
        { status: 400 },
      );
    }
    if (tasks.length === 0) {
      return NextResponse.json({ error: 'Nessuna riga valida trovata nel file.' }, { status: 400 });
    }

    // Guardrail tassonomia (spec §6): il file è accettato SOLO se ogni riga ha una
    // descrizione attività riconosciuta; un solo errore rifiuta TUTTO il file.
    const index = buildTassonomiaIndex(await caricaTassonomia());
    const esito = validaImport(tasks, committente, index);
    if (!esito.ok) {
      return NextResponse.json({ error: 'file_non_conforme', errori: esito.errori }, { status: 422 });
    }
    // Da qui in poi si lavora con descrizione CANONICA + gruppo derivato.
    const arricchiti = new Map<Task, { descrizioneCanonica: string; gruppo: string }>();
    for (const r of esito.righe) arricchiti.set(r.task, { descrizioneCanonica: r.descrizioneCanonica, gruppo: r.gruppo });

    // Dedup interno al batch sulle righe con odl (l'ultima occorrenza vince).
    const conOdl = new Map<string, Task>();
    const senzaOdl: Task[] = [];
    for (const t of tasks) {
      const odl = nrm(t.odl);
      if (odl) conOdl.set(odl, t);
      else senzaOdl.push(t);
    }

    // Quali odl esistono già per questo (committente, data)?
    const odlList = [...conOdl.keys()];
    const esistenti = new Map<string, string>(); // odl -> id
    if (odlList.length > 0) {
      const { data: rows, error } = await supabaseAdmin
        .from('interventi')
        .select('id, odl')
        .eq('committente', committente)
        .eq('data', data)
        .in('odl', odlList);
      if (error) throw error;
      for (const r of rows ?? []) {
        if (r.odl) esistenti.set(String(r.odl), String(r.id));
      }
    }

    const batchId = randomUUID();
    const baseRiga = (t: Task) => ({
      ...taskToDescrittivi(t, arricchiti.get(t)),
      committente,
      data,
      lotto,
      import_batch_id: batchId,
    });

    // Inserimenti: righe senza odl + righe con odl non ancora presente.
    const toInsert = [
      ...senzaOdl.map(baseRiga),
      ...[...conOdl.entries()].filter(([odl]) => !esistenti.has(odl)).map(([, t]) => baseRiga(t)),
    ];
    // Aggiornamenti: righe con odl già presente (solo campi descrittivi).
    const toUpdate = [...conOdl.entries()]
      .filter(([odl]) => esistenti.has(odl))
      .map(([odl, t]) => ({ id: esistenti.get(odl)!, descrittivi: { ...taskToDescrittivi(t, arricchiti.get(t)), import_batch_id: batchId } }));

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from('interventi').insert(toInsert);
      if (error) throw error;
    }
    for (const u of toUpdate) {
      const { error } = await supabaseAdmin.from('interventi').update(u.descrittivi).eq('id', u.id);
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      batchId,
      committente,
      data,
      lotto,
      totaliRighe: tasks.length,
      inseriti: toInsert.length,
      aggiornati: toUpdate.length,
      // Descrizioni fuorvianti riscritte canoniche (auto-allineamento): trasparenza per il backoffice.
      allineati: esito.allineate,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore import interventi.' },
      { status: 500 },
    );
  }
}
