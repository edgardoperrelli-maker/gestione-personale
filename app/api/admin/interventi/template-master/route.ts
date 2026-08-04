import 'server-only';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { parseMasterUpload, type RigaMasterUpload } from '@/lib/attivita/masterUpload';
import { chiaveOdl, chiaveRiga, righeNuoveMaster } from '@/lib/attivita/righeNuoveMaster';
// La stessa normalizzazione con cui il sync decide se una correzione è vera: due giudizi
// diversi qui e là farebbero contare «aggiornata» una riga che al registro non cambia niente.
import { normAnagrafica } from '@/lib/acqualatina/ordiniDaMaster';

export const runtime = 'nodejs';
// Un file corretto al primo caricamento può aggiornare migliaia di righe di catalogo:
// il minuto di default non basta. Stesso tetto di acea/import.
export const maxDuration = 300;

const BATCH = 500;
const COMMITTENTI = ['acea', 'italgas', 'acqualatina', 'altro'] as const;
type Committente = (typeof COMMITTENTI)[number];

function committenteValido(c: string | null): Committente {
  return (COMMITTENTI as readonly string[]).includes(c ?? '') ? (c as Committente) : 'acea';
}

/** GET: i master caricati + info sullo snapshot DUNNING dell'agente (per la pagina admin). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabaseAdmin
    .from('template_master')
    .select('id, nome, committente, attivo, file_nome, gruppi_default, righe_totali, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Info di contorno sulla fonte ACEA automatica: prima il registro (`acea_ordini`,
  // import del modulo ACEA), altrimenti lo snapshot dell'agente. Best-effort.
  let fonteAcea: { tipo: 'registro' | 'agente'; righe: number; aggiornato: string | null } | null = null;
  try {
    const { count, error: eCount } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl', { count: 'exact', head: true });
    if (eCount) throw eCount;
    if ((count ?? 0) > 0) {
      const { data: ultimo } = await supabaseAdmin
        .from('acea_ordini')
        .select('aggiornato_il')
        .order('aggiornato_il', { ascending: false })
        .limit(1)
        .maybeSingle();
      fonteAcea = { tipo: 'registro', righe: count ?? 0, aggiornato: (ultimo as { aggiornato_il?: string } | null)?.aggiornato_il ?? null };
    }
  } catch { /* registro assente: si prova lo snapshot */ }
  if (!fonteAcea) {
    try {
      const { count } = await supabaseAdmin
        .from('acea_master_snapshot')
        .select('odl', { count: 'exact', head: true });
      const { data: ultimo } = await supabaseAdmin
        .from('acea_master_snapshot')
        .select('raccolto_at')
        .order('raccolto_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      fonteAcea = { tipo: 'agente', righe: count ?? 0, aggiornato: (ultimo as { raccolto_at?: string } | null)?.raccolto_at ?? null };
    } catch { /* nessuna fonte automatica */ }
  }

  return NextResponse.json({ masters: data ?? [], fonteAcea }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * POST: carica un file master (multipart: `file`, `nome?`, `committente?`,
 * `gruppi_default?` = JSON array di GRUPPI ATTIVITÀ dal catalogo tassonomia — mai testo
 * libero, un refuso creerebbe un gruppo-doppione fuori catalogo).
 * Le colonne si risolvono per NOME (parseMasterUpload); le righe senza ODL sono scartate.
 * Il master entra ATTIVO: da subito nel foglio MasterODL del template.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'File mancante.' }, { status: 400 });
  }
  const nomeFile = file.name;
  const lower = nomeFile.toLowerCase();
  if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls') && !lower.endsWith('.csv')) {
    return NextResponse.json({ error: 'Formato non supportato (usa .xlsx, .xls o .csv).' }, { status: 400 });
  }
  const nome = String(form.get('nome') ?? '').trim() || nomeFile.replace(/\.(xlsx|xls|csv)$/i, '');
  const committente = committenteValido(form.get('committente') as string | null);
  let gruppiDefault: string[] | null = null;
  try {
    const raw = JSON.parse(String(form.get('gruppi_default') ?? 'null'));
    if (Array.isArray(raw)) {
      const puliti = [...new Set(raw.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, 50);
      gruppiDefault = puliti.length > 0 ? puliti : null;
    }
  } catch {
    return NextResponse.json({ error: 'Campo "gruppi_default" non valido (atteso JSON array).' }, { status: 400 });
  }

  // Endpoint admin a basso traffico: file letto in memoria (poche migliaia di righe attese).
  let rows: unknown[][];
  try {
    let wb: XLSX.WorkBook;
    if (lower.endsWith('.csv')) {
      const text = (await file.text()).replace(/^﻿/, '');
      const fs = /;/.test(text.split(/\r?\n/)[0] ?? '') ? ';' : ',';
      wb = XLSX.read(text, { type: 'string', FS: fs });
    } else {
      wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    }
    const ws = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined;
    if (!ws) return NextResponse.json({ error: 'File vuoto o privo di fogli.' }, { status: 422 });
    // raw:false: gli ODL numerici arrivano come TESTO formattato (mai notazione scientifica).
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  } catch {
    return NextResponse.json({ error: 'Impossibile leggere il file.' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseMasterUpload(rows);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'File non valido.' }, { status: 422 });
  }
  if (parsed.righe.length === 0) {
    return NextResponse.json({ error: 'Nessuna riga valida (ODL assente).' }, { status: 422 });
  }

  // ── Solo le righe DAVVERO nuove ───────────────────────────────────────────
  // Prima ogni caricamento inseriva tutto: ricaricare lo stesso file (la cosa piu' normale
  // quando si corregge una cella) creava un secondo master attivo e raddoppiava il
  // censimento — con esso il peso dello scaricamento sul telefono degli operatori, perche'
  // la versione della cache cambia e il campo riscarica.
  // Si guardano solo i master ATTIVI dello stesso committente: uno spento e' fuori dal
  // lookup, quindi ricaricarne le righe e' legittimo.
  // L'identita' e' la COPPIA (ODL, matricola), non l'ODL: sotto un ODL AcquaLatina possono
  // esserci fino a 5 contatori di un condominio, e confrontare il solo ordine ne butterebbe
  // via 133 sul master di Terracina — contatori veri, che sparirebbero dal censimento
  // (vedi righeNuoveMaster.ts).
  type RigaCatalogo = {
    id: string; odl: string | null; matricola: string | null; impianto: string | null;
    indirizzo: string | null; cap: string | null; comune: string | null;
    operazione: string | null; nominativo: string | null; recapito: string | null;
  };
  const righeCatalogo: RigaCatalogo[] = [];
  {
    const { data: attivi } = await supabaseAdmin
      .from('template_master')
      .select('id')
      .eq('committente', committente)
      .eq('attivo', true);
    const ids = ((attivi ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (ids.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabaseAdmin
          .from('template_master_righe')
          .select('id, odl, matricola, impianto, indirizzo, cap, comune, operazione, nominativo, recapito')
          .in('master_id', ids)
          .range(from, from + 999);
        if (error) break; // best-effort: senza catalogo si ricade sul comportamento storico
        const batch = (data ?? []) as RigaCatalogo[];
        righeCatalogo.push(...batch);
        if (batch.length < 1000) break;
      }
    }
  }
  const chiaviEsistenti = new Set<string>(righeCatalogo.map((r) => chiaveRiga(r)));
  const catalogoPerOdl = new Map<string, RigaCatalogo[]>();
  const catalogoPerChiave = new Map<string, RigaCatalogo>();
  for (const r of righeCatalogo) {
    const k = chiaveOdl(r.odl);
    if (k === '') continue;
    catalogoPerOdl.set(k, [...(catalogoPerOdl.get(k) ?? []), r]);
    catalogoPerChiave.set(chiaveRiga(r), r);
  }

  /*
    Le righe del file SENZA matricola il cui ODL è già a catalogo non sono righe nuove: sono
    lo stesso punto, portato da un file più povero (il battente del sito non ha matricole).
    Lasciarle passare da `righeNuoveMaster` — che confronta la coppia (ODL, matricola), quindi
    «ODL|» contro «ODL|MTR…» — creerebbe un doppione a matricola vuota per OGNI riga del
    battente: 4.203 punti sdoppiati al primo caricamento. Restano fuori dall'inserimento e
    lavorano solo come veicolo di correzioni, qui sotto.
  */
  const daInserire = parsed.righe.filter(
    (r) => !(chiaveOdl(r.matricola) === ''
      && catalogoPerOdl.has(chiaveOdl(r.odl))
      && !chiaviEsistenti.has(chiaveRiga(r))),
  );
  const soloCorrezioni = parsed.righe.length - daInserire.length;

  const filtro = righeNuoveMaster(daInserire, chiaviEsistenti);

  /*
    L'ANAGRAFICA delle righe già a catalogo si allinea al file: dal 04/08 il master
    sovrascrive il difforme (decisione utente: l'export del committente è la fonte), non è più
    solo «righe nuove». Senza questo passaggio la correzione non avrebbe strada: il filtro qui
    sopra scarta le righe già viste, e il sync legge il catalogo — un file corretto ricaricato
    non cambierebbe niente. Campo vuoto nel file = dato non portato: non cancella mai.
    La matricola non si tocca: è metà dell'identità della riga.
  */
  const CAMPI_CORREZIONE = ['impianto', 'indirizzo', 'cap', 'comune', 'operazione', 'nominativo', 'recapito'] as const;
  const patchPerRiga = new Map<string, Partial<Record<(typeof CAMPI_CORREZIONE)[number], string>>>();
  for (const r of parsed.righe) {
    const perChiave = catalogoPerChiave.get(chiaveRiga(r));
    const bersagli = perChiave
      ? [perChiave]
      : chiaveOdl(r.matricola) === '' ? (catalogoPerOdl.get(chiaveOdl(r.odl)) ?? []) : [];
    for (const b of bersagli) {
      const patch = patchPerRiga.get(b.id) ?? {};
      for (const campo of CAMPI_CORREZIONE) {
        const dalFile = normAnagrafica(r[campo as keyof RigaMasterUpload]);
        if (dalFile === '' || campo in patch) continue;
        if (dalFile !== normAnagrafica(b[campo])) {
          patch[campo] = String(r[campo as keyof RigaMasterUpload]).replace(/\s+/g, ' ').trim();
        }
      }
      if (Object.keys(patch).length > 0) patchPerRiga.set(b.id, patch);
    }
  }
  let aggiornate = 0;
  {
    const daAggiornare = [...patchPerRiga.entries()];
    const CONCORRENZA = 20;
    for (let i = 0; i < daAggiornare.length; i += CONCORRENZA) {
      const esiti = await Promise.all(daAggiornare.slice(i, i + CONCORRENZA).map(async ([id, patch]) => {
        const { error } = await supabaseAdmin.from('template_master_righe').update(patch).eq('id', id);
        return error ? 0 : 1;
      }));
      aggiornate += esiti.reduce((a: number, b) => a + b, 0);
    }
  }

  // Niente di nuovo: non si crea un master vuoto che sporcherebbe l'elenco. Si dice cosa e'
  // successo, che e' l'informazione utile ("l'ho gia'" non e' un errore).
  if (filtro.nuove.length === 0) {
    return NextResponse.json({
      ok: true,
      id: null,
      righe: 0,
      totale: parsed.totale,
      scartate: parsed.scartate,
      giaPresenti: filtro.giaPresenti + soloCorrezioni,
      doppieNelFile: filtro.doppieNelFile,
      aggiornate,
      impianti: null,
    });
  }

  const { data: master, error: eIns } = await supabaseAdmin
    .from('template_master')
    .insert({ nome, committente, file_nome: nomeFile, gruppi_default: gruppiDefault, righe_totali: filtro.nuove.length })
    .select('id')
    .single();
  if (eIns || !master) return NextResponse.json({ error: eIns?.message ?? 'Insert fallita.' }, { status: 500 });
  const masterId = (master as { id: string }).id;

  const payload = filtro.nuove.map((r) => ({ master_id: masterId, ...r }));
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabaseAdmin.from('template_master_righe').insert(payload.slice(i, i + BATCH));
    if (error) {
      // niente master a metà: si toglie il file (cascade sulle righe già inserite)
      await supabaseAdmin.from('template_master').delete().eq('id', masterId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Se il file porta gli IMPIANTI, gli ordini del committente che ne sono privi si
  // allineano da soli: il caricamento del master è l'evento che porta il dato, ed è qui
  // che va consumato. La funzione non sovrascrive mai un impianto già presente e non esce
  // dal committente del master (vedi 20260731120000).
  // Best-effort come le sonde del GET: le righe del master sono già dentro, e un
  // allineamento fallito non è un buon motivo per far fallire il caricamento — al massimo
  // si ricarica il file.
  let impianti: { interventi: number; voci: number } | null = null;
  if (filtro.nuove.some((r) => r.impianto !== '')) {
    try {
      const { data, error } = await supabaseAdmin.rpc('allinea_impianti_da_master', { p_master_id: masterId });
      if (error) throw error;
      const r = (data as Array<{ interventi_aggiornati: number; voci_aggiornate: number }> | null)?.[0];
      impianti = { interventi: r?.interventi_aggiornati ?? 0, voci: r?.voci_aggiornate ?? 0 };
    } catch { /* DB non ancora migrato o allineamento fallito: il master resta caricato */ }
  }

  return NextResponse.json({
    ok: true,
    id: masterId,
    righe: filtro.nuove.length,
    totale: parsed.totale,
    scartate: parsed.scartate,
    giaPresenti: filtro.giaPresenti + soloCorrezioni,
    doppieNelFile: filtro.doppieNelFile,
    aggiornate,
    impianti,
  });
}
