import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { richiestaToIntervento } from '@/lib/interventi/manuali/richiestaToIntervento';
import { risolviTerritorioIdPerPiano } from '@/lib/interventi/territorioOverride';
import { isTaskVia, ATTIVITA_TASK_VIA } from '@/lib/interventi/manuali/taskVia';
import { colonneAnagraficaVoce } from '@/lib/interventi/manuali/buildVoceManuale';
import { estraiMatricola } from '@/lib/interventi/manuali/estraiMatricola';
import { estraiSigillo, normSigillo } from '@/lib/interventi/manuali/estraiSigillo';
import { usernameFromEmail } from '@/lib/auth/usernameFromEmail';
import { fotoPresentiVerificate, pathMancanti } from '@/lib/interventi/manuali/verificaFotoStorage';
import type { DatiInterventoManuale, CommittenteManuale } from '@/lib/interventi/manuali/types';
import { caricaTassonomia } from '@/lib/attivita/caricaTassonomia';
import { buildTassonomiaIndex, risolviGruppo } from '@/lib/attivita/tassonomia';
import { caricaFlussi } from '@/lib/consuntivazione/flusso';
import { risolviFlussoVoceManuale } from '@/lib/interventi/manuali/risolviFlussoVoceManuale';
import { messaggioErroreManuale } from '@/lib/interventi/manuali/messaggioErroreManuale';
import { esitoInterventoDaVoce } from '@/lib/interventi/esitoDaVoce';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const runtime = 'nodejs';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Catch globale: qualunque errore inatteso torna come JSON { error } (così la UI può
  // mostrare il messaggio REALE invece di un opaco "HTTP 500") e finisce nei log runtime.
  try {
    return await handlePOST(req, ctx);
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    console.error('[approva] errore non gestito:', messaggio);
    return NextResponse.json({ error: messaggio }, { status: 500 });
  }
}

async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await params;

  const body = (await req.json()) as { dati_correnti?: DatiInterventoManuale; confermaDuplicato?: boolean; confermaFotoMancanti?: boolean };

  // Leggi la richiesta per ottenere il piano_id, staff_id, data, committente e
  // dati_correnti di default (servono prima del check atomico per costruire il record).
  const { data: richiesta } = await supabaseAdmin
    .from('interventi_manuali')
    .select('id, stato, voce_id, intervento_id, piano_id, staff_id, data, committente, dati_correnti, parent_voce_id, rapportino_id')
    .eq('id', id)
    .maybeSingle();
  if (!richiesta) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Regola di business: se la richiesta è un "+" sotto un task-via (voce contenitore BONIFICHE
  // EXTRA), l'intervento approvato va forzato a Italgas + BONIFICHE EXTRA.
  let parentTaskVia = false;
  if (richiesta.parent_voce_id) {
    const { data: pv } = await supabaseAdmin
      .from('rapportino_voci').select('attivita').eq('id', richiesta.parent_voce_id).maybeSingle();
    parentTaskVia = isTaskVia(pv as { attivita: string | null } | null);
  }

  const dati = (body.dati_correnti ?? richiesta.dati_correnti) as DatiInterventoManuale;
  const committente = (dati.committente ?? richiesta.committente) as CommittenteManuale;

  // ── OBBLIGO DESCRIZIONE ATTIVITÀ (spec §7, BLOCCANTE) ────────────────────────
  // Anche l'approvazione crea un intervento (corsia "normale"): senza questo controllo una
  // richiesta vecchia/non classificata (o corretta a mano fuori tassonomia) genererebbe un
  // intervento con gruppo_attivita mancante. Stesso motore/lista chiusa del "+" e della route
  // di creazione.
  const indiceTassonomia = buildTassonomiaIndex(await caricaTassonomia());
  const attivitaRaw = String((dati.anagrafica as { attivita?: unknown } | undefined)?.attivita ?? '').trim();
  if (!attivitaRaw) {
    return NextResponse.json(
      { error: 'attivita_obbligatoria', messaggio: messaggioErroreManuale({ error: 'attivita_obbligatoria' }, 400) },
      { status: 400 },
    );
  }
  // Coerente col write: stesso alias di scrittura di richiestaToIntervento (una variante nota
  // passa il guard e verrà scritta canonica; le sconosciute vere restano rifiutate).
  if (!risolviGruppo(committente, attivitaRaw, indiceTassonomia, { allinea: 'scrittura' })) {
    return NextResponse.json(
      { error: 'attivita_sconosciuta', attivita: attivitaRaw, messaggio: messaggioErroreManuale({ error: 'attivita_sconosciuta' }, 400) },
      { status: 400 },
    );
  }
  // Sotto un task-via l'attività È SEMPRE BONIFICHE EXTRA (server autorevole): la forziamo qui così
  // la voce riportata dall'approvazione (colonneAnagraficaVoce) resta allineata all'intervento
  // creato — a prescindere da cosa aveva scelto l'operatore o il revisore nella lista Italgas.
  dati.anagrafica.attivita = parentTaskVia ? ATTIVITA_TASK_VIA : attivitaRaw;

  // ── CONTROLLO SIGILLO DUPLICATO (BLOCCANTE, NON forzabile) ───────────────────
  // Un sigillo è un identificativo fisico unico: lo stesso sigillo su due interventi è
  // SEMPRE un errore di battitura. Se è già presente su un intervento che finisce nel file
  // master (limitazioni completate), l'approvazione si BLOCCA: va corretto qui, non spedito
  // come duplicato. A differenza del controllo matricola, non c'è alcun bypass.
  const sigillo = estraiSigillo(dati);
  if (sigillo) {
    // voci con lo STESSO sigillo già collegate a un intervento (≠ questa richiesta).
    // Il file master legge il sigillo da rapportino_voci.risposte->>'sigillo': è la fonte giusta.
    const { data: vociDup } = await supabaseAdmin
      .from('rapportino_voci')
      .select('intervento_id, risposte')
      .not('intervento_id', 'is', null)
      .ilike('risposte->>sigillo', sigillo);
    const intIds = [
      ...new Set(
        ((vociDup ?? []) as Array<{ intervento_id: string | null; risposte: Record<string, unknown> | null }>)
          .filter((v) => v.intervento_id && normSigillo(v.risposte?.sigillo) === normSigillo(sigillo))
          .map((v) => v.intervento_id as string),
      ),
    ].filter((iid) => iid !== richiesta.intervento_id);

    if (intIds.length > 0) {
      // Restringi agli interventi che vanno DAVVERO nel master (limitazioni completate),
      // così non si blocca su sigilli omonimi di flussi diversi.
      const { data: intRows } = await supabaseAdmin
        .from('interventi')
        .select('id, data, comune, odl, matricola_contatore, staff_id')
        .in('id', intIds)
        .eq('stato', 'completato')
        .or('committente.eq.lim_massive,intervento_tipo.ilike.%limitaz%,intervento_tipo.ilike.%massiv%');

      const rows = (intRows ?? []) as Array<{
        id: string; data: string | null; comune: string | null; odl: string | null;
        matricola_contatore: string | null; staff_id: string | null;
      }>;
      if (rows.length > 0) {
        // Risolvi i nomi esecutore dalla tabella staff (staff_id è text).
        const staffIds = [...new Set(rows.map((r) => r.staff_id).filter((v): v is string => !!v))];
        const nomi: Record<string, string> = {};
        if (staffIds.length > 0) {
          const { data: staffRows } = await supabaseAdmin
            .from('staff')
            .select('id, display_name')
            .in('id', staffIds);
          for (const s of (staffRows ?? []) as Array<{ id: string; display_name: string }>) {
            nomi[s.id] = s.display_name;
          }
        }
        const duplicati = rows.map((r) => ({
          id: r.id,
          data: r.data,
          comune: r.comune,
          odl: r.odl,
          matricola: r.matricola_contatore,
          staff_name: r.staff_id ? (nomi[r.staff_id] ?? null) : null,
        }));
        return NextResponse.json({ error: 'sigillo_duplicato', sigillo, duplicati }, { status: 409 });
      }
    }
  }

  // ── CONTROLLO MATRICOLA DUPLICATA ────────────────────────────────────────────
  // Avvisa se esiste già un intervento APPROVATO con la stessa matricola e lo
  // stesso committente. Non bloccante: l'admin può forzare con confermaDuplicato.
  const matricola = estraiMatricola(dati);
  if (matricola && body.confermaDuplicato !== true) {
    const { data: dupRows } = await supabaseAdmin
      .from('interventi_manuali')
      .select('id, data, staff_name, deciso_da, deciso_at')
      .eq('stato', 'approvato')
      .eq('committente', committente)
      .eq('dati_correnti->anagrafica->>matricola', matricola)
      .neq('id', id)
      .order('deciso_at', { ascending: false });

    const dup = (dupRows ?? []) as Array<{ id: string; data: string | null; staff_name: string | null; deciso_da: string | null; deciso_at: string | null }>;
    if (dup.length > 0) {
      // Risolvi chi ha approvato (auth.users: profiles è vuota).
      const ids = new Set(dup.map((d) => d.deciso_da).filter((v): v is string => !!v));
      const nomi: Record<string, string> = {};
      if (ids.size > 0) {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
        for (const u of authData?.users ?? []) {
          if (ids.has(u.id)) nomi[u.id] = usernameFromEmail(u.email) || u.id;
        }
      }
      const duplicati = dup.map((d) => ({
        id: d.id,
        data: d.data,
        staff_name: d.staff_name,
        deciso_at: d.deciso_at,
        deciso_da_name: d.deciso_da ? (nomi[d.deciso_da] ?? null) : null,
      }));
      return NextResponse.json({ error: 'matricola_duplicata', matricola, duplicati }, { status: 409 });
    }
  }

  // ── GATE FOTO MANCANTI (non bloccante, forzabile) ────────────────────────────
  if (body.confermaFotoMancanti !== true) {
    const { data: fotoRows } = await supabaseAdmin
      .from('interventi_manuali_foto')
      .select('storage_path')
      .eq('richiesta_id', id);
    const paths = ((fotoRows ?? []) as Array<{ storage_path: string }>).map((f) => f.storage_path);
    if (paths.length > 0) {
      const presenti = await fotoPresentiVerificate(paths);
      const mancanti = pathMancanti(paths, presenti);
      if (mancanti.length > 0) {
        return NextResponse.json({ error: 'foto_mancanti', mancanti: mancanti.length }, { status: 409 });
      }
    }
  }

  // ── CHECK-AND-SET ATOMICO ────────────────────────────────────────────────────
  // Aggiorna stato+dati_correnti+deciso_* SOLO se la riga è ancora in_attesa.
  // Se due admin premono "approva" contemporaneamente, solo il primo ottiene locked != null.
  const { data: locked } = await supabaseAdmin
    .from('interventi_manuali')
    .update({
      stato: 'approvato',
      dati_correnti: dati,
      deciso_da: user.id,
      deciso_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('stato', 'in_attesa')
    .select('*')
    .maybeSingle();
  if (!locked) return NextResponse.json({ error: 'gia_gestita' }, { status: 409 });

  // ── Crea l'intervento ────────────────────────────────────────────────────────
  // Territorio ereditato dal piano dell'operatore (override per-operatore se presente): senza,
  // l'intervento manuale nascerebbe senza territorio e sparirebbe dai filtri per territorio dello
  // storico. Best-effort: se non risolve resta null (l'approvazione non si blocca).
  const territorioId = await risolviTerritorioIdPerPiano(supabaseAdmin, richiesta.piano_id as string | null, richiesta.staff_id ? String(richiesta.staff_id) : null);
  const record = richiestaToIntervento(dati, {
    committente,
    data: (richiesta.data as string),
    staff_id: String(richiesta.staff_id ?? ''),
    piano_id: (richiesta.piano_id as string | null) ?? null,
    territorio_id: territorioId,
    taskViaParent: parentTaskVia,
    // AcquaLatina: approvare E' assegnare. L'operatore e' sul posto e deve ancora lavorare,
    // quindi l'intervento nasce 'assegnato' e lo chiude `invia` con l'esito vero.
    daAssegnare: committente === 'acqualatina',
  }, indiceTassonomia);

  const { data: intRow, error: eInt } = await supabaseAdmin
    .from('interventi')
    .insert(record)
    .select('id')
    .single();
  if (eInt) {
    console.error('[approva] insert intervento fallito:', eInt.code, eInt.message);
    // Compensazione: l'insert dell'intervento è fallito DOPO il check-and-set che ha già
    // marcato la richiesta 'approvato'. Senza rollback resta uno stato rotto irrecuperabile
    // (richiesta approvata + nessun intervento + voce bloccata 'in_attesa', e il guard
    // atomico impedisce la ri-approvazione). Ripristino lo stato → la richiesta torna
    // ri-approvabile dalla UI.
    await supabaseAdmin
      .from('interventi_manuali')
      .update({ stato: 'in_attesa', deciso_da: null, deciso_at: null })
      .eq('id', id);
    // 23505 = unique_violation: l'indice dedup (committente, odl, data) impedisce un doppione.
    // Messaggio chiaro al posto del raw Postgres "duplicate key…".
    if (eInt.code === '23505') {
      return NextResponse.json({
        error: 'intervento_duplicato',
        messaggio: `Esiste già un intervento per ODL ${record.odl ?? '—'} in data ${record.data} (${committente}). Impossibile creare un doppione: verifica ODL e matricola.`,
      }, { status: 409 });
    }
    return NextResponse.json({ error: eInt.message }, { status: 500 });
  }

  // ── Aggiorna la voce (se presente) ──────────────────────────────────────────
  // Oltre a intervento_id + stato, riporta sulla voce l'anagrafica/risposte CORRETTE in
  // approvazione (es. PDR aggiunta, matricola corretta): vivono in `dati_correnti` e senza questo
  // il rapportino/PDF resterebbe col dato vecchio dell'operatore (matricola sbagliata, PDR mancante).
  //
  // Il flusso del GRUPPO ATTIVITÀ finale (classificazione autorevole appena scritta su `record`,
  // es. Italgas+BONIFICHE EXTRA sotto un task-via) si congela qui sulla voce se non lo era già:
  // il "+" nasce spesso 'in_attesa' SENZA `intervento_id` (buildVoceManuale non ha ancora un
  // gruppo da cui risolvere), e fino a qui la voce ripiegava sul modulo del rapportino padre —
  // sbagliato quando quel rapportino è di un ALTRO committente (rapportini misti). Non sovrascrive
  // mai un `campi_snapshot` già presente (es. già congelato alla creazione dal fix del "+").
  // Committente e gruppo, MAI il territorio: vedi risolviFlussoVoceManuale.
  if (richiesta.voce_id) {
    let flussoVoce: ReturnType<typeof risolviFlussoVoceManuale> = null;
    if (record.gruppo_attivita) {
      const flussi = await caricaFlussi(supabaseAdmin);
      flussoVoce = risolviFlussoVoceManuale(record.committente, record.gruppo_attivita, flussi);
    }

    const { data: voceEsistente } = await supabaseAdmin
      .from('rapportino_voci')
      .select('campi_snapshot')
      .eq('id', richiesta.voce_id)
      .maybeSingle();
    const haGiaSnapshot = Array.isArray((voceEsistente as { campi_snapshot?: unknown } | null)?.campi_snapshot)
      && ((voceEsistente as { campi_snapshot: unknown[] }).campi_snapshot.length > 0);
    const { data: voceAgg } = await supabaseAdmin
      .from('rapportino_voci')
      .update({
        intervento_id: intRow!.id,
        approvazione_stato: 'approvato',
        ...colonneAnagraficaVoce(dati),
        ...(!haGiaSnapshot && flussoVoce ? { template_id: flussoVoce.templateId, campi_snapshot: flussoVoce.campi } : {}),
      })
      .eq('id', richiesta.voce_id)
      .select('risposte, campi_snapshot')
      .maybeSingle();

    /*
      RECUPERO POST-INVIO: l'approvazione arrivata DOPO che il rapportino è partito.

      L'intervento nasce «assegnato» perché su AcquaLatina approvare è assegnare, e a chiuderlo
      con l'esito vero ci pensa `invia` (app/api/r/[token]/invia/route.ts). Ma se il rapportino
      è GIÀ inviato quel passaggio non tornerà mai: `tokenStatus` lo respinge come
      «non_modificabile», e l'intervento resta assegnato per sempre — con la sua voce che
      dichiara un esito e lo Storico che lo mostra come fatto. È successo l'11/08/2026 su cinque
      «+» AcquaLatina approvati cinque minuti dopo l'invio: cinque righe di registro rimaste
      aperte a lavoro consegnato, e il confronto col sito a segnalarle come nostro esito
      mancante. Stesso sintomo del caso 957327236 del 05/08, che `invia` cura solo per le voci
      orfane al momento dell'invio — non per gli interventi che ancora non esistevano.

      L'esito lo legge la STESSA funzione che userebbe `invia`, dalla stessa voce: una voce
      senza esito (neutra) non chiude niente, com'è giusto. Best-effort: un'approvazione non
      deve fallire perché il recupero non è riuscito — la richiesta è già approvata e
      l'intervento creato, e questo è il di più che gli evita di restare a metà.
    */
    if (voceAgg && richiesta.rapportino_id) {
      try {
        const { data: rapportino } = await supabaseAdmin
          .from('rapportini')
          .select('stato, campi_snapshot')
          .eq('id', richiesta.rapportino_id as string)
          .maybeSingle();
        if ((rapportino as { stato?: string } | null)?.stato === 'inviato') {
          const campiVoce = (voceAgg as { campi_snapshot?: unknown }).campi_snapshot;
          const campiEsito = (Array.isArray(campiVoce) && campiVoce.length > 0
            ? campiVoce
            : ((rapportino as { campi_snapshot?: unknown }).campi_snapshot ?? [])) as TemplateCampo[];
          const patch = esitoInterventoDaVoce(
            ((voceAgg as { risposte?: Record<string, unknown> | null }).risposte ?? {}),
            campiEsito,
          );
          if (patch) {
            const { error } = await supabaseAdmin
              .from('interventi')
              .update({ stato: 'completato', esito: patch.esito, esito_motivo: patch.esito_motivo })
              .eq('id', intRow!.id)
              .neq('stato', 'annullato');
            if (error) throw error;
          }
        }
      } catch (e) {
        console.error('[approva] chiusura post-invio non riuscita:', e instanceof Error ? e.message : String(e));
      }
    }
  }

  // ── Aggiorna interventi_manuali con l'intervento_id ─────────────────────────
  const { error: eReq } = await supabaseAdmin
    .from('interventi_manuali')
    .update({ intervento_id: intRow!.id })
    .eq('id', id);
  if (eReq) { console.error('[approva] update interventi_manuali fallito:', eReq.message); return NextResponse.json({ error: eReq.message }, { status: 500 }); }

  return NextResponse.json({ ok: true, interventoId: intRow!.id });
}
