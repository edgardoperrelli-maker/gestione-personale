import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  pianoPianificazione, etichettaMotivo,
  type InterventoEsistente, type OrdineDaPianificare,
} from '@/lib/acea/pianificazione';
import { indiceTassonomiaCached } from '@/lib/acea/indiceTassonomia';
import { tassonomiaAttivitaAcea } from '@/lib/acea/tassonomiaAcea';
import { chiaveAssegnazione, controllaAssegnazioni } from '@/lib/acea/operatoriGiorno';
import { PROFILO_COMMESSA, parseFamiglia, type Famiglia } from '@/lib/acea/famiglia';
import {
  ATTIVITA_SOSTITUZIONE_MISURATORE, GRUPPO_SOSTITUZIONE_MISURATORI,
} from '@/lib/acqualatina/contratto';
import { soloAttivazioni } from '@/lib/acea/giorniProgrammabili';
import { eRiapertura } from '@/lib/acea/scadenza';
import { partiRoma } from '@/lib/orarioRoma';

export const runtime = 'nodejs';

type Corpo = {
  /** Chiavi `odl|numero_operazione` delle righe selezionate. */
  chiavi?: string[];
  data?: string;
  staffId?: string;
  /**
   * La famiglia della VISTA da cui arriva la selezione: decide il registro da cui leggere le
   * righe (acea_ordini / acqualatina_ordini). Assente = dunning, che legge il registro ACEA —
   * è il comportamento storico, e le famiglie ACEA convivono nella stessa tabella.
   */
  famiglia?: string;
};

/**
 * POST /api/acea/pianifica — assegna operatore e giorno alle righe selezionate.
 *
 * Restituisce un `operazioneId` con cui l'azione può essere annullata: prima di scrivere si
 * registra lo stato precedente di ogni riga toccata.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json()) as Corpo;
    const chiavi = Array.isArray(corpo.chiavi) ? corpo.chiavi : [];
    const data = String(corpo.data ?? '');
    const staffId = String(corpo.staffId ?? '');
    const famigliaVista = parseFamiglia(corpo.famiglia);
    const profilo = PROFILO_COMMESSA[famigliaVista];

    if (chiavi.length === 0) {
      return NextResponse.json({ error: 'Nessuna riga selezionata.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: 'Data non valida (YYYY-MM-DD).' }, { status: 400 });
    }
    if (!staffId) {
      return NextResponse.json({ error: 'Operatore mancante.' }, { status: 400 });
    }

    /*
      0) La finestra e il cronoprogramma, prima di toccare qualunque cosa.

      Si programma da oggi a due settimane avanti (domenica esclusa), e solo su chi quel giorno è
      in tabellone. Il controllo sta qui e non solo nel campo data perché la stessa scrittura si
      può chiedere incollando da Excel — e una regola che vale solo per la barra è decorativa.
    */
    const oggi = partiRoma(new Date()).oggi;
    const odlSelezionati = [...new Set(chiavi.map((k) => k.split('|')[0]))];
    const blocchi: string[][] = [];
    for (let i = 0; i < odlSelezionati.length; i += 200) blocchi.push(odlSelezionati.slice(i, i + 200));

    /*
      Quattro letture INDIPENDENTI, in parallelo: il controllo finestra+tabellone, gli ordini dal
      registro, gli interventi esistenti e la tassonomia (cachata un minuto). Erano in fila e la
      pianificazione pagava la somma delle latenze; nessuna SCRITTURA parte comunque prima che il
      controllo abbia detto sì — il rifiuto arriva solo qualche lettura più tardi, a costo zero.
    */
    /*
      Il controllo del tabellone parte per ENTRAMBE le famiglie, prima di sapere quali righe sono
      state selezionate. Non è uno spreco cercato: la famiglia delle righe la dice il registro, che
      si sta leggendo NELLO STESSO Promise.all — aspettarla avrebbe rimesso in fila le letture che
      questo blocco esiste per parallelizzare. Si consuma poi solo il verdetto delle famiglie
      davvero presenti; le letture in più sono tre query piccole e indicizzate.
    */
    const [motivi, ordini, esistenti, indice] = await Promise.all([
      // `dataScritta: true`: qui il giorno lo si sceglie in barra, quindi la finestra vale piena.
      // Nella vista acqualatina la famiglia è una sola; nelle viste ACEA si controllano entrambe
      // upfront, perché la famiglia delle righe la dice il registro che si sta leggendo sotto.
      controllaAssegnazioni(
        (famigliaVista === 'acqualatina'
          ? (['acqualatina'] as Famiglia[])
          : (['dunning', 'massive'] as Famiglia[])
        ).map((famiglia) => ({ data, staffId, dataScritta: true, famiglia })),
        oggi,
      ),
      (async () => {
        // 1) Ordini selezionati, letti dal registro (non dal client: il client potrebbe avere una
        //    fotografia vecchia, e su questi dati si decide chi va dove).
        const out: OrdineDaPianificare[] = [];
        for (const blocco of blocchi) {
          const { data: righe, error } = await supabaseAdmin
            .from(profilo.tabellaOrdini)
            .select('id, odl, numero_operazione, famiglia, aperto, attivita, comune, via, civico, cap, matricola, codice_sla, impianto, nominativo, recapito')
            .in('odl', blocco);
          if (error) throw error;
          for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
            const chiave = `${String(r.odl)}|${String(r.numero_operazione)}`;
            if (!chiavi.includes(chiave)) continue;
            out.push({
              odl: String(r.odl),
              numero_operazione: String(r.numero_operazione),
              ordine_id: (r.id as string | null) ?? null,
              famiglia: parseFamiglia(r.famiglia),
              aperto: r.aperto === true,
              attivita: (r.attivita as string | null) ?? null,
              comune: (r.comune as string | null) ?? null,
              via: (r.via as string | null) ?? null,
              civico: (r.civico as string | null) ?? null,
              cap: (r.cap as string | null) ?? null,
              matricola: (r.matricola as string | null) ?? null,
              impianto: (r.impianto as string | null) ?? null,
              nominativo: (r.nominativo as string | null) ?? null,
              recapito: (r.recapito as string | null) ?? null,
              riapertura: eRiapertura(r.codice_sla as string | null),
            });
          }
        }
        return out;
      })(),
      (async () => {
        // 2) Interventi già esistenti su quegli ODL (qualunque data): servono a spostare invece
        //    di duplicare, e a non toccare il lavoro già completato. La matricola viaggia per
        //    l'unità acqualatina (ODL+matricola).
        const out: InterventoEsistente[] = [];
        for (const blocco of blocchi) {
          const { data: righe, error } = await supabaseAdmin
            .from('interventi')
            .select('id, odl, data, staff_id, stato, esito, matricola_contatore')
            .in('odl', blocco)
            .in('committente', [...profilo.committenti]);
          if (error) throw error;
          for (const r of (righe ?? []) as Array<Record<string, unknown>>) {
            if (!r.odl) continue;
            out.push({
              id: String(r.id), odl: String(r.odl), data: String(r.data ?? ''),
              staff_id: (r.staff_id as string | null) ?? null, stato: String(r.stato ?? ''),
              esito: (r.esito as string | null) ?? null,
              matricola: (r.matricola_contatore as string | null) ?? null,
            });
          }
        }
        return out;
      })(),
      // 3) Tassonomia: descrizione canonica e gruppo (vedi lib/acea/tassonomiaAcea.ts per l'alias
      //    di scrittura). Best-effort: senza, l'intervento nasce con l'attività grezza.
      indiceTassonomiaCached(),
    ]);

    if (ordini.length === 0) {
      return NextResponse.json({ error: 'Nessun ordine trovato nel registro.' }, { status: 404 });
    }
    // Il verdetto delle sole famiglie fra le righe selezionate: nella pratica una (la selezione
    // arriva da una vista), e se mai fossero due l'operatore deve andare bene a tutt'e due.
    const famiglie = [...new Set(ordini.map((o) => o.famiglia ?? 'dunning'))] as Famiglia[];
    const rifiuto = famiglie
      .map((famiglia) => motivi.get(chiaveAssegnazione({ data, staffId, famiglia })))
      .find(Boolean);
    if (rifiuto) {
      return NextResponse.json({ error: rifiuto.replace(/^./, (c) => c.toUpperCase()) }, { status: 400 });
    }

    const piano = pianoPianificazione({
      ordini, esistenti, data, staffId, soloAttivazioni: soloAttivazioni(data),
      unita: profilo.unita,
    });

    // 4) Scritture + registrazione dello stato precedente per l'annullamento.
    const azioniLog: Array<Record<string, unknown>> = [];
    let creati = 0;
    let aggiornati = 0;

    for (const a of piano.azioni) {
      if (a.tipo === 'salta') continue;
      if (a.tipo === 'aggiorna') {
        const { error } = await supabaseAdmin
          .from('interventi')
          .update({ data, staff_id: staffId, stato: 'assegnato', assegnato_at: new Date().toISOString() })
          .eq('id', a.interventoId);
        if (error) throw error;
        aggiornati++;
        azioniLog.push({
          odl: a.ordine.odl, numero_operazione: a.ordine.numero_operazione,
          azione: 'aggiornato', intervento_id: a.interventoId, prima: a.prima,
        });
        continue;
      }
      // Tassonomia: ACEA risolve l'attività sugli alias; acqualatina ha UNA attività di
      // capitolato, e la si scrive canonica senza lookup (la tassonomia in prod ha quella riga).
      const tass = famigliaVista === 'acqualatina'
        ? { tipo: ATTIVITA_SOSTITUZIONE_MISURATORE, gruppo: GRUPPO_SOSTITUZIONE_MISURATORI }
        : tassonomiaAttivitaAcea(a.ordine.attivita, indice);
      const { data: creato, error } = await supabaseAdmin
        .from('interventi')
        .insert({
          committente: profilo.committenteScrittura,
          odl: a.ordine.odl,
          ordine_id: a.ordine.ordine_id,
          data,
          staff_id: staffId,
          stato: 'assegnato',
          assegnato_at: new Date().toISOString(),
          intervento_tipo: tass.tipo,
          gruppo_attivita: tass.gruppo,
          matricola_contatore: a.ordine.matricola,
          indirizzo: [a.ordine.via, a.ordine.civico].filter(Boolean).join(' ') || null,
          comune: a.ordine.comune,
          cap: a.ordine.cap,
          /*
            L'anagrafica scende dal registro all'intervento, e da lì alla voce di rapportino
            (`sincronizzaRapportiniAcea`): sono i campi PDR, NOMINATIVO e RECAPITO che
            l'operatore vede sul telefono.

            Mancavano, e non in astratto: le 25 righe pianificate per il 03/08 sono nate senza
            PDR e senza nome utente, mentre le 254 arrivate dal vecchio percorso (il file di
            pianificazione dell'ufficio) ce li avevano. Il registro conosceva il cod. fornitura
            di tutte e 4.196 le righe e non lo passava a nessuno.

            Vale per TUTTE le famiglie, non solo acqualatina. `pdr` e `impianto` sono lo stesso
            slot con lo stesso significato — su ACEA 3.926 interventi su 4.998 ce l'hanno già,
            arrivati per altre strade — e lasciare vuoti quelli pianificati da qui sarebbe lo
            stesso difetto, con un altro committente sopra. Nome utente e recapito su ACEA
            restano NULL da soli: il suo export non li porta, quindi non c'è niente da copiare.

            `?? null` e non `|| null`: una stringa vuota nel registro resta vuota, ed è diverso
            da «non lo so» — ma per la voce di rapportino l'effetto è lo stesso, quindi qui non
            si complica oltre.
          */
          pdr: a.ordine.impianto ?? null,
          nominativo: a.ordine.nominativo ?? null,
          recapito: a.ordine.recapito ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      creati++;
      azioniLog.push({
        odl: a.ordine.odl, numero_operazione: a.ordine.numero_operazione,
        azione: 'creato', intervento_id: creato?.id ?? null, prima: null,
      });
    }

    /*
      Gli appunti (`pianificato_*_bozza`) hanno finito il loro compito sulle righe arrivate in
      fondo — pianificate ora o già nello stato chiesto. La barra prima non li puliva, e la bozza
      orfana, invisibile in tabella dove l'intervento vince, restava a bloccare la generazione
      dei rapportini come riga a metà. Best-effort come la lettura in /celle: una colonna di
      migration non ancora passata non deve far fallire la pianificazione.
    */
    try {
      const saltate = new Set<string>();
      for (const a of piano.azioni) {
        if (a.tipo === 'salta') saltate.add(`${a.ordine.odl}|${a.ordine.numero_operazione}`);
      }
      const lavorate = new Set(ordini.map((o) => `${o.odl}|${o.numero_operazione}`));
      for (const blocco of blocchi) {
        const { data: righeBozza, error: eBozza } = await supabaseAdmin
          .from(profilo.tabellaOrdini)
          .select('odl, numero_operazione, pianificato_a_bozza, pianificato_il_bozza')
          .in('odl', blocco);
        if (eBozza) throw eBozza;
        for (const r of (righeBozza ?? []) as Array<Record<string, unknown>>) {
          const chiaveRiga = `${String(r.odl)}|${String(r.numero_operazione)}`;
          if (!lavorate.has(chiaveRiga) || saltate.has(chiaveRiga)) continue;
          if (!r.pianificato_a_bozza && !r.pianificato_il_bozza) continue;
          const { error: ePulizia } = await supabaseAdmin
            .from(profilo.tabellaOrdini)
            .update({ pianificato_a_bozza: null, pianificato_il_bozza: null })
            .eq('odl', String(r.odl))
            .eq('numero_operazione', String(r.numero_operazione));
          if (ePulizia) throw ePulizia;
        }
      }
    } catch (e) {
      console.error('[acea/pianifica] appunti di pianificazione non puliti:', e);
    }

    // 5) L'operazione si registra solo se qualcosa è stato scritto: un'operazione vuota nello
    //    storico farebbe annullare "l'ultima azione" senza che ce ne sia una.
    let operazioneId: string | null = null;
    if (azioniLog.length > 0) {
      const { data: op, error } = await supabaseAdmin
        .from('acea_operazioni')
        .insert({
          tipo: 'pianifica',
          attore: auth.user.id,
          dettaglio: { data, staff_id: staffId, azioni: azioniLog },
        })
        .select('id')
        .single();
      if (error) throw error;
      operazioneId = (op?.id as string) ?? null;
    }

    return NextResponse.json({
      operazioneId,
      creati,
      aggiornati,
      invariati: piano.azioni.length === 0 ? ordini.length : ordini.length - piano.azioni.length,
      saltati: piano.azioni
        .filter((a): a is Extract<typeof a, { tipo: 'salta' }> => a.tipo === 'salta')
        .map((a) => ({
          odl: a.ordine.odl,
          numero_operazione: a.ordine.numero_operazione,
          motivo: etichettaMotivo(a.motivo, a.ordine.famiglia),
        })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore pianificazione.' },
      { status: 500 },
    );
  }
}
