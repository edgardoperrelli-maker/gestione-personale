import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { buildVoceInterventoLinker, type InterventoLinkRow } from '@/lib/interventi/voceInterventoLink';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import { esitoScrivibile } from '@/lib/interventi/scritturaEsito';
import { chiavePositivo, decidiChiusuraConPositivi, indicizzaPositivi } from '@/lib/interventi/odlPositivi';
import { rimuoviVociBloccate, sweepDopoPositivi } from '@/lib/interventi/sweepOdlPositivo';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { rapportinoInviabile } from '@/lib/interventi/manuali/rapportinoInviabile';
import { isRimozioneTipo } from '@/lib/interventi/rimozioneMisuratore';
import { righeIncomplete } from '@/utils/rapportini/righeIncomplete';
import { indiciVociIncomplete } from '@/utils/rapportini/vociIncompleteInvio';
import { tplTaskViaPerVoce } from '@/lib/rapportini/tplTaskViaPerVoce';
import { ymdLocal } from '@/utils/date-it';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, staff_id, staff_name, campi_snapshot, riaperto_at, tipo, template_id')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  const { data: vociApprovazione } = await supabaseAdmin
    .from('rapportino_voci')
    .select('approvazione_stato')
    .eq('rapportino_id', rap.id);
  const gate = rapportinoInviabile(
    ((vociApprovazione ?? []) as Array<{ approvazione_stato: string | null }>),
  );
  if (!gate.inviabile)
    return NextResponse.json({ error: 'voci_in_sospeso', inSospeso: gate.inSospeso }, { status: 409 });

  // Sweep verso se stesso: le voci NON compilate il cui ODL è già positivo altrove (bloccate
  // lato operatore) vengono rimosse ORA, prima del gate esiti — altrimenti renderebbero il
  // rapportino ininviabile. Best-effort: se fallisce, il gate sotto resta la garanzia.
  try {
    await rimuoviVociBloccate(supabaseAdmin, rap.id);
  } catch (e) {
    console.error('[invia] rimozione voci bloccate fallita:', e instanceof Error ? e.message : String(e));
  }

  // Blocco ESITI MANCANTI: il rapportino non è inviabile finché ogni voce (esclusi i "+" e i
  // contenitori task-via) non ha un esito valido — nessun esito ('senza_esito') o un "NO" senza la
  // nota col motivo ('nota_mancante') bloccano ("NESSUN PASSAGGIO" è auto-esplicativo). Il client già
  // lo impedisce (inviabile = daFare===0); qui è la GARANZIA lato server, così un ordine senza esito
  // non resta mai aperto (né via coda offline né via richieste dirette).
  {
    // Flag task-via del template (contenitori senza esito proprio): letti in modo resiliente, come
    // fa il loader operatore (colonne prod-only). Assenti → false (nessun contenitore extra).
    const templateId = (rap as { template_id?: string | null }).template_id ?? null;
    let taskViaTutto = false;
    let taskViaIbrido = false;
    if (templateId) {
      const t1 = await supabaseAdmin.from('rapportino_template').select('task_via').eq('id', templateId).maybeSingle();
      taskViaTutto = Boolean((t1.data as { task_via?: boolean } | null)?.task_via);
      const t2 = await supabaseAdmin.from('rapportino_template').select('task_via_ibrido').eq('id', templateId).maybeSingle();
      taskViaIbrido = Boolean((t2.data as { task_via_ibrido?: boolean } | null)?.task_via_ibrido);
    }
    const { data: vociGate } = await supabaseAdmin
      .from('rapportino_voci')
      .select('id, risposte, campi_snapshot, attivita, manuale')
      .eq('rapportino_id', rap.id);
    // Flag task-via dei flussi PER-VOCE: una voce di un flusso non task-via non è mai un
    // contenitore, anche se la testata è task-via (rapportino misto o testata sbagliata) —
    // senza questa guardia il gate la esentava dall'esito e l'ordine restava aperto per sempre.
    // Best-effort come il resto dei flag: colonne/righe assenti → nessun override, vale la testata.
    const selTplVoci = await supabaseAdmin
      .from('rapportino_voci').select('id, template_id').eq('rapportino_id', rap.id);
    const tplTaskViaByVoce = await tplTaskViaPerVoce(
      supabaseAdmin,
      (selTplVoci.data ?? []) as Array<{ id: string; template_id: string | null }>,
    );
    const campiRap = ((rap as { campi_snapshot?: unknown }).campi_snapshot ?? []) as TemplateCampo[];
    const vociConFlag = ((vociGate ?? []) as Array<{ id: string }>).map((v) => ({
      ...v,
      tplTaskVia: tplTaskViaByVoce.get(v.id) ?? null,
    }));
    const incomplete = indiciVociIncomplete(vociConFlag as never, campiRap, { tutto: taskViaTutto, ibrido: taskViaIbrido });
    if (incomplete.length > 0) {
      const senzaEsito = incomplete.filter((m) => m.motivo === 'senza_esito').length;
      const notaMancante = incomplete.filter((m) => m.motivo === 'nota_mancante').length;
      // Esito positivo dichiarato con la matricola obbligatoria vuota: la voce non è chiusa. Si
      // conta a parte perché è l'unico dei tre che NON si risolve guardando l'esito.
      const matricolaMancante = incomplete.filter((m) => m.motivo === 'matricola_mancante').length;
      return NextResponse.json(
        {
          error: 'esiti_mancanti',
          voci: incomplete.length,
          senza_esito: senzaEsito,
          nota_mancante: notaMancante,
          matricola_mancante: matricolaMancante,
        },
        { status: 409 },
      );
    }
  }

  // Risanamento: gate foto obbligatorie (righe misuratore + fasi civico).
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    const campiSnap = ((rap as { campi_snapshot?: unknown }).campi_snapshot ?? []) as TemplateCampo[];
    const [{ data: vRis }, { data: rRis }] = await Promise.all([
      supabaseAdmin.from('rapportino_voci').select('id, via, risposte').eq('rapportino_id', rap.id),
      supabaseAdmin.from('rapportino_righe').select('id, voce_id, matricola, risposte').eq('rapportino_id', rap.id),
    ]);
    const val = righeIncomplete((vRis ?? []) as never, (rRis ?? []) as never, campiSnap);
    if (!val.ok) return NextResponse.json({ error: 'foto_mancanti', dettagli: val.dettagli }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('rapportini').update({ stato: 'inviato', submitted_at: new Date().toISOString() }).eq('id', rap.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Risanamento: archivia i misuratori lavorati (righe con ref_id): copia ref→archivio + rimuovi da ref.
  if ((rap as { tipo?: string }).tipo === 'risanamento') {
    try {
      const { data: righeRef } = await supabaseAdmin
        .from('rapportino_righe').select('ref_id').eq('rapportino_id', rap.id).not('ref_id', 'is', null);
      const refIds = [...new Set(((righeRef ?? []) as Array<{ ref_id: number | null }>).map((r) => r.ref_id).filter((x): x is number => x != null))];
      if (refIds.length) {
        const { data: refs } = await supabaseAdmin
          .from('risanamento_misuratori_ref')
          .select('id, matricola, pdr, nominativo, indirizzo, civico, comune, cap, import_id')
          .in('id', refIds);
        if (refs && refs.length) {
          const archivio = (refs as Array<{ id: number; matricola: string; pdr: string | null; nominativo: string | null; indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null; import_id: string | null }>).map((r) => ({
            matricola: r.matricola, pdr: r.pdr ?? '', nominativo: r.nominativo ?? '',
            indirizzo: r.indirizzo ?? '', civico: r.civico ?? '', comune: r.comune ?? '', cap: r.cap ?? '',
            import_id: r.import_id, ref_id_originale: r.id, rapportino_id: rap.id,
          }));
          await supabaseAdmin.from('risanamento_misuratori_archivio').insert(archivio);
          await supabaseAdmin.from('risanamento_misuratori_ref').delete().in('id', refs.map((r) => r.id));
        }
      }
    } catch (e) {
      console.error('[risanamento] archivio fallito (invio comunque ok):', e);
    }
  }

  // Unificazione: chiudi ogni intervento collegato con l'esito DELLA SUA voce (Fatto/Non fatto).
  // Annullati invariati; voci senza esito (neutro) non chiudono.
  const campi = (rap.campi_snapshot ?? []) as TemplateCampo[];
  const { data: voci } = await supabaseAdmin
    .from('rapportino_voci')
    .select('id, intervento_id, raw_json, risposte, updated_at, matricola, pdr, odl, via, comune, campi_snapshot, approvazione_stato')
    .eq('rapportino_id', rap.id);
  /*
    Aggancio d'ULTIMA ISTANZA: il loop qui sotto salta le voci senza intervento, quindi una voce
    rimasta scollegata (race di generazione, o compilata prima dell'auto-aggancio del
    salvataggio) uscirebbe dall'invio con l'esito dichiarato e MAI propagato — il caso
    957327236 (2026-08-05): «ESEGUITO SI» nello storico, intervento fermo ad `assegnato`,
    ODL fra i «senza rapportino». Prima di propagare, le orfane vengono ricollegate con lo
    stesso risolutore della generazione (fallback alle colonne della voce incluso).
  */
  try {
    const orfane = ((voci ?? []) as Array<{ id: string; intervento_id: string | null }>).filter((v) => !v.intervento_id);
    const staffId = (rap as { staff_id?: string | null }).staff_id ?? null;
    if (orfane.length > 0 && staffId) {
      const { data: cand } = await supabaseAdmin
        .from('interventi')
        .select('id, staff_id, odl, matricola_contatore, pdr')
        .eq('staff_id', staffId)
        .eq('data', rap.data)
        .neq('stato', 'annullato');
      const resolve = buildVoceInterventoLinker((cand ?? []) as InterventoLinkRow[]);
      for (const v of (voci ?? []) as Array<{ id: string; intervento_id: string | null; raw_json: unknown; odl: string | null; matricola: string | null; pdr: string | null; approvazione_stato: string | null }>) {
        if (v.intervento_id) continue;
        const raw = (v.raw_json ?? {}) as { odl?: unknown; odsin?: unknown; matricola?: unknown; pdr?: unknown };
        const found = resolve({
          staff_id: staffId,
          odl: (raw.odl as string | null | undefined) ?? (raw.odsin as string | null | undefined) ?? v.odl,
          matricola: (raw.matricola as string | null | undefined) ?? v.matricola,
          pdr: (raw.pdr as string | null | undefined) ?? v.pdr,
          // Il reinvio di un rapportino riaperto è il punto esatto in cui una voce rifiutata
          // si prendeva l'intervento di un'altra: qui il rifiuto va detto al risolutore.
          approvazione_stato: v.approvazione_stato,
        });
        if (found) {
          v.intervento_id = found;
          await supabaseAdmin.from('rapportino_voci').update({ intervento_id: found }).eq('id', v.id);
        }
      }
    }
  } catch (e) {
    console.error('[invia] riaggancio voci orfane fallito:', e instanceof Error ? e.message : String(e));
  }
  const misuratoriFermi: Array<{
    intervento_id: string;
    rapportino_id: string;
    odl: string | null;
    data_esecuzione: string;
    esecutore: string | null;
    indirizzo: string | null;
    comune: string | null;
    matricola: string;
    pdr: string | null;
  }> = [];
  // Registro AcquaLatina: stessa raccolta, tabella separata (i due committenti hanno
  // cicli logistici e responsabili diversi). Niente `pdr`: un misuratore d'acqua non
  // ha un punto di riconsegna gas.
  const misuratoriAcqualatina: Array<Omit<(typeof misuratoriFermi)[number], 'pdr'>> = [];

  // Pre-fetch committente per instradare ogni rimozione al registro del suo committente
  const interventoIds = ((voci ?? []) as Array<{ intervento_id: string | null }>)
    .map(v => v.intervento_id)
    .filter((id): id is string => !!id);
  const { data: interventiMeta } = interventoIds.length > 0
    ? await supabaseAdmin.from('interventi').select('id, committente, intervento_tipo, odl, data').in('id', interventoIds)
    : { data: [] as Array<{ id: string; committente: string; intervento_tipo: string | null; odl: string | null; data: string }> };
  const committenteMap = new Map((interventiMeta ?? []).map(i => [i.id, i.committente as string]));
  const tipoMap = new Map((interventiMeta ?? []).map(i => [i.id, (i.intervento_tipo ?? '') as string]));
  // Giornata di lavoro a cui l'intervento appartiene: è la data che il registro misuratori deve
  // riportare, e non coincide con l'istante in cui la voce viene compilata o rispedita.
  const dataMap = new Map((interventiMeta ?? []).map(i => [i.id, (i.data as string | null) ?? null]));
  const odlMap = new Map((interventiMeta ?? []).map(i => [i.id, ((i.odl as string | null) ?? '').trim()]));

  // Backstop anti doppio esito: positivi GIÀ presenti per gli stessi ODL (qualsiasi data).
  // Un ODL con positivo altrove è definitivamente chiuso → un nuovo positivo va annullato
  // come doppione, un negativo va marcato da_riconciliare. Vedi lib/interventi/odlPositivi.ts.
  const odlsChiusura = [...new Set([...odlMap.values()].filter(Boolean))];
  let positiviEsistenti = new Map<string, { id: string; data: string | null }>();
  if (odlsChiusura.length > 0) {
    // `matricola_contatore` viaggia nell'indice: per acqualatina l'invariante è per contatore
    // (un ODL copre più matricole), per gli altri committenti la chiave la ignora.
    const { data: posRows } = await supabaseAdmin
      .from('interventi')
      .select('id, odl, data, committente, matricola_contatore')
      .eq('esito', 'eseguito_positivo')
      .in('odl', odlsChiusura);
    positiviEsistenti = indicizzaPositivi(
      ((posRows ?? []) as Array<{
        id: string; odl: string | null; data: string | null; committente: string | null;
        matricola_contatore: string | null;
      }>).map((r) => ({ ...r, matricola: r.matricola_contatore })),
    );
  }

  const chiusiPositivi: string[] = []; // interventi chiusi POSITIVI in questo invio → sweep finale
  for (const v of (voci ?? []) as Array<{
    intervento_id: string | null;
    risposte: Record<string, unknown> | null;
    updated_at: string;
    matricola: string | null;
    pdr: string | null;
    odl: string | null;
    via: string | null;
    comune: string | null;
    campi_snapshot?: unknown;
  }>) {
    if (!v.intervento_id) continue;
    // Esito valutato sui campi DELLA voce (flusso del suo gruppo attività, fallback rapportino).
    const campiV = Array.isArray(v.campi_snapshot) && v.campi_snapshot.length > 0
      ? (v.campi_snapshot as TemplateCampo[])
      : campi;
    const patch = esitoInterventoDaVoce(v.risposte ?? {}, campiV);
    if (!patch) continue;

    const odlVoce = odlMap.get(v.intervento_id) || '';
    const decisione = decidiChiusuraConPositivi({
      interventoId: v.intervento_id,
      esitoPositivo: patch.esito === 'eseguito_positivo',
      // La matricola della VOCE: per acqualatina distingue i contatori dello stesso ODL.
      originale: odlVoce
        ? positiviEsistenti.get(chiavePositivo(committenteMap.get(v.intervento_id), odlVoce, v.matricola))
        : null,
    });
    if (decisione.tipo === 'annulla_doppio_positivo') {
      // Doppio positivo: NON è un esito reale. L'intervento si annulla con motivazione e
      // finisce nella lista di riconciliazione; l'originale resta l'unico positivo valido.
      await supabaseAdmin
        .from('interventi')
        .update({
          stato: 'annullato', esito: null, esito_motivo: decisione.motivo,
          da_riconciliare: true, riconciliazione_rif_id: decisione.rifId, chiuso_at: v.updated_at,
        })
        .eq('id', v.intervento_id)
        .neq('stato', 'annullato');
      continue; // niente registro misuratori: il doppione non è una rimozione valida
    }

    /*
      Il positivo vince sempre: una voce che declasserebbe un intervento gia` eseguito, e che
      quell'intervento lo condivide con un'altra voce, non ha titolo per smentirla — il lavoro
      l'ha fatto qualcun altro. Regola in `decisioneScritturaEsito`.

      E` il caso 12384609 del 14/08/2026: LIBERATORI invia «SI» alle 13:18, PRATESI «NO» alle
      13:27 sullo stesso intervento, e vinceva l'ultimo a premere invia.
    */
    const scrivibile = await esitoScrivibile(supabaseAdmin, v.intervento_id, patch.esito);
    if (!scrivibile.scrivi) {
      console.warn('[r/invia] esito non propagato:', { interventoId: v.intervento_id, motivo: scrivibile.motivo });
      continue;
    }

    // chiuso_at = ora di compilazione della voce (updated_at), non l'ora di invio.
    const flagRiconcilia =
      decisione.tipo === 'chiudi_e_riconcilia'
        ? { da_riconciliare: true, riconciliazione_rif_id: decisione.rifId }
        : {};
    await supabaseAdmin
      .from('interventi')
      .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo, chiuso_at: v.updated_at, ...flagRiconcilia })
      .eq('id', v.intervento_id)
      .neq('stato', 'annullato');
    if (patch.esito === 'eseguito_positivo') chiusiPositivi.push(v.intervento_id);

    // Raccolta misuratori rimossi: esito positivo + matricola presente. Ogni rimozione
    // va al registro del SUO committente — i due hanno cicli logistici distinti.
    const committente = committenteMap.get(v.intervento_id);
    if (patch.esito === 'eseguito_positivo' && v.matricola && v.matricola.trim()) {
      const riga = {
        intervento_id:   v.intervento_id,
        rapportino_id:   rap.id,
        odl:             v.odl ?? null,
        // Data ESECUZIONE = la GIORNATA DI LAVORO dell'intervento, non l'istante in cui la voce
        // è stata toccata. Nascendo da `v.updated_at` bastava riaprire un rapportino e
        // rispedirlo perché tutte le sue righe risultassero eseguite il giorno della
        // rispedizione: il 03/08 sono così finite nel registro 39 rimozioni del 31/07,
        // datate 03/08 — un magazzino e delle statistiche per giorno che dicono il falso.
        // La data del rapportino resta il ripiego per gli interventi senza data propria.
        data_esecuzione: dataMap.get(v.intervento_id) ?? (rap as { data: string }).data,
        esecutore:       (rap as { staff_name?: string | null }).staff_name ?? null,
        indirizzo:       v.via ?? null,
        comune:          v.comune ?? null,
        matricola:       v.matricola.trim(),
      };
      // ACEA: solo le attività di rimozione — il suo catalogo ne ha molte altre, e le
      // rimozioni di impianti ABUSIVI non devono entrare a magazzino.
      if (committente === 'acea' && isRimozioneTipo(tipoMap.get(v.intervento_id))) {
        misuratoriFermi.push({ ...riga, pdr: v.pdr ?? null });
      }
      // AcquaLatina: nessun gate sul tipo. La commessa ha UNA sola attività ed è già
      // una sostituzione, quindi ogni voce eseguita è per definizione una rimozione.
      if (committente === 'acqualatina') {
        misuratoriAcqualatina.push(riga);
      }
    }
  }

  /*
    Inserisci nei registri misuratori (idempotente: ON CONFLICT DO NOTHING).

    L'esito si LEGGE. Fino al 2026-08-03 questi due upsert erano `await` nudi, e quello
    AcquaLatina falliva a ogni chiusura — l'indice di unicità era parziale e `ON CONFLICT`
    non lo agganciava. Nessuno se n'è accorto per settimane: 212 rapportini chiusi in
    positivo e un registro a zero, con l'errore che tornava dal DB e finiva nel nulla.

    Si logga ma NON si fallisce: l'operatore sul campo ha finito il suo lavoro, e un
    rapportino respinto perché il magazzino non ha registrato il contatore sarebbe un danno
    peggiore del buco. Il recupero c'è ed è il «Ricalcola» del registro.
  */
  if (misuratoriFermi.length > 0) {
    const { error } = await supabaseAdmin
      .from('misuratori_rimossi')
      .upsert(misuratoriFermi, { onConflict: 'intervento_id', ignoreDuplicates: true });
    if (error) console.error('[invia] registro misuratori ACEA non scritto:', error.message);
  }
  if (misuratoriAcqualatina.length > 0) {
    const { error } = await supabaseAdmin
      .from('acqualatina_misuratori_rimossi')
      .upsert(misuratoriAcqualatina, { onConflict: 'intervento_id', ignoreDuplicates: true });
    if (error) console.error('[invia] registro misuratori AcquaLatina non scritto:', error.message);
  }

  // Sweep: i positivi appena registrati revocano le voci non compilate con lo stesso ODL
  // negli altri rapportini aperti (anche di piani futuri già generati). Best-effort.
  if (chiusiPositivi.length > 0) {
    try {
      await sweepDopoPositivi(supabaseAdmin, chiusiPositivi);
    } catch (e) {
      console.error('[invia] sweep positivi fallito:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true });
}
