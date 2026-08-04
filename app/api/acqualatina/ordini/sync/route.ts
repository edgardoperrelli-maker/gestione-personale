import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { partiRoma } from '@/lib/agente/orarioRoma';
import { COMMITTENTE_ACQUALATINA, ATTIVITA_SOSTITUZIONE_MISURATORE } from '@/lib/acqualatina/contratto';
import { ordiniDaMaster, type OrdineEsistente, type RigaMaster } from '@/lib/acqualatina/ordiniDaMaster';
// Lo stato della riga mai lavorata, dalla stessa fonte degli altri due: sono le voci dell'imbuto
// «Stato», e una scritta a mano qui diventerebbe una quarta voce che nessuno si aspetta.
import { STATO_APERTA } from '@/lib/acqualatina/chiusuraRegistro';

export const runtime = 'nodejs';
// Il primo giro su un file corretto può portare migliaia di correzioni (registro + interventi
// aperti): il minuto di default non basta. Stesso tetto di acea/import.
export const maxDuration = 300;

const PAGINA = 1000;

/**
 * POST /api/acqualatina/ordini/sync — allinea il registro al master del committente.
 *
 * ADDITIVO sugli stati e CORRETTIVO sull'anagrafica, idempotente: tira dentro le coppie
 * (ODL, matricola) che il registro non ha ancora, dai master ATTIVI del committente acqualatina
 * (Impostazioni → Template master). Rilanciarlo a vuoto non scrive niente. È il gesto per il
 * file del mese nuovo: si carica il master, si preme qui.
 *
 * Delle righe già presenti tocca SOLO l'anagrafica (indirizzo, comune, cod. fornitura, nome
 * utente, recapito — mai stati, pianificazione o matricola già presente), sovrascrivendo il
 * difforme: il file del committente è la fonte. La stessa correzione scende sugli interventi
 * APERTI agganciati (`ordine_id`), così si corregge UNA volta sola; i completati restano la
 * fotografia storica del lavoro fatto.
 *
 * Niente cancellazioni: una riga sparita dal file del mese resta a registro con la sua storia.
 * Se un giorno servirà «ritirata dal committente», sarà uno stato, non una DELETE.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    // 1) I master attivi del committente: ognuno porta il suo nome nel riepilogo.
    const { data: masters, error: eMaster } = await supabaseAdmin
      .from('template_master')
      .select('id, nome')
      .eq('committente', COMMITTENTE_ACQUALATINA)
      .eq('attivo', true);
    if (eMaster) throw eMaster;
    const elencoMaster = (masters ?? []) as Array<{ id: string; nome: string | null }>;
    if (elencoMaster.length === 0) {
      return NextResponse.json(
        { error: 'Nessun master attivo per AcquaLatina: caricalo in Impostazioni → Template master.' },
        { status: 404 },
      );
    }

    // 2) Le righe di tutti i master attivi, paginate.
    const righe: Array<RigaMaster & { master_id: string }> = [];
    for (const m of elencoMaster) {
      for (let offset = 0; ; offset += PAGINA) {
        const { data, error } = await supabaseAdmin
          .from('template_master_righe')
          .select('id, odl, matricola, indirizzo, comune, cap, impianto, nominativo, recapito')
          .eq('master_id', m.id)
          .range(offset, offset + PAGINA - 1);
        if (error) throw error;
        const blocco = (data ?? []) as RigaMaster[];
        righe.push(...blocco.map((r) => ({ ...r, master_id: m.id })));
        if (blocco.length < PAGINA) break;
      }
    }

    // 3) Cosa c'è già a registro: la funzione pura decide chiavi, numerazione e correzioni.
    //    L'`id` viaggia in più: è l'aggancio (`interventi.ordine_id`) con cui una correzione
    //    anagrafica raggiunge gli interventi aperti che la riga ha già generato.
    type RigaRegistro = OrdineEsistente & { id: string };
    const esistenti: RigaRegistro[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('id, odl, numero_operazione, matricola, impianto, nominativo, recapito, comune, cap, via, civico')
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as RigaRegistro[];
      esistenti.push(...blocco);
      if (blocco.length < PAGINA) break;
    }

    const masterDiRiga = new Map(righe.map((r) => [r.id, r.master_id]));
    const { nuovi, correzioni, giaPresenti, scartate } = ordiniDaMaster(righe, esistenti);

    // 4) Inserimento a blocchi. `data_creazione` è il giorno del sync, in fuso di lavoro:
    //    è la data in cui la riga è ENTRATA nel registro, non una data del committente.
    const oggi = partiRoma(new Date()).oggi;
    for (let i = 0; i < nuovi.length; i += 500) {
      const blocco = nuovi.slice(i, i + 500).map((n) => ({
        odl: n.odl,
        numero_operazione: n.numero_operazione,
        famiglia: 'acqualatina',
        attivita: ATTIVITA_SOSTITUZIONE_MISURATORE,
        stato: 'APERTO',
        stato_desc: STATO_APERTA,
        aperto: true,
        data_creazione: oggi,
        via: n.via,
        civico: n.civico,
        cap: n.cap,
        comune: n.comune,
        matricola: n.matricola,
        matricola_norm: n.matricola_norm,
        // L'anagrafica del punto e dell'utente. Il sync non la portava: l'impianto delle
        // 4.196 righe di luglio è entrato con una correzione a parte, e nome utente e
        // recapito non entravano affatto. Senza queste tre righe il file del mese prossimo
        // rifarebbe lo stesso buco.
        impianto: n.impianto,
        nominativo: n.nominativo,
        recapito: n.recapito,
        master_id: masterDiRiga.get(n.master_riga_id) ?? null,
        master_riga_id: n.master_riga_id,
      }));
      const { error } = await supabaseAdmin.from('acqualatina_ordini').insert(blocco);
      if (error) throw error;
    }

    /*
      5) Le CORREZIONI anagrafiche sulle righe già presenti — e la loro propagazione.

      L'unica scrittura di questo endpoint su una riga esistente resta ristretta all'anagrafica
      (la funzione pura decide i campi: mai stati, pianificazione o matricola già presente):
      dal 04/08 il master SOVRASCRIVE il difforme, non riempie più solo i vuoti — l'export del
      committente è la fonte, e il valore vecchio costringeva a correggere due volte a mano.

      La stessa correzione scende sugli INTERVENTI APERTI della riga (`ordine_id`): la
      pianificazione FOTOGRAFA l'anagrafica alla creazione (indirizzo, nominativo, PDR,
      matricola…), e senza questo passaggio l'operatore uscirebbe con l'indirizzo che il
      committente ha appena corretto. Gli interventi COMPLETATI o ANNULLATI non si toccano:
      sono la fotografia storica di dov'è andata la squadra quel giorno, e riscriverli
      falsificherebbe il rapportino.

      Una `update` per riga e non un upsert (l'upsert vorrebbe tutte le colonne NOT NULL), a
      blocchi concorrenti: al primo giro su un file corretto le righe possono essere migliaia,
      al secondo sono zero — l'idempotenza è il confronto normalizzato in `patchAnagrafica`.
    */
    const perChiaveRegistro = new Map(esistenti.map((e) => [`${e.odl}#${e.numero_operazione}`, e]));
    let interventiAggiornati = 0;
    const CONCORRENZA = 20;
    for (let i = 0; i < correzioni.length; i += CONCORRENZA) {
      await Promise.all(correzioni.slice(i, i + CONCORRENZA).map(async (c) => {
        const { error } = await supabaseAdmin
          .from('acqualatina_ordini')
          .update(c.patch)
          .eq('odl', c.odl)
          .eq('numero_operazione', c.numero_operazione);
        if (error) throw error;

        const presente = perChiaveRegistro.get(`${c.odl}#${c.numero_operazione}`);
        if (!presente) return;
        // Lo stato FINALE della riga (valori correnti + patch): è quello che l'intervento
        // aperto deve fotografare di nuovo.
        const dopo = { ...presente, ...c.patch };
        const { data: toccati, error: eInt } = await supabaseAdmin
          .from('interventi')
          .update({
            indirizzo: [dopo.via, dopo.civico].filter(Boolean).join(' ') || null,
            comune: dopo.comune ?? null,
            cap: dopo.cap ?? null,
            pdr: dopo.impianto ?? null,
            nominativo: dopo.nominativo ?? null,
            recapito: dopo.recapito ?? null,
            matricola_contatore: dopo.matricola || null,
          })
          .eq('ordine_id', presente.id)
          .not('stato', 'in', '(completato,annullato)')
          .select('id');
        if (eInt) throw eInt;
        interventiAggiornati += (toccati ?? []).length;
      }));
    }

    return NextResponse.json(
      {
        inseriti: nuovi.length,
        corrette: correzioni.length,
        interventiAggiornati,
        giaPresenti,
        scartate,
        master: elencoMaster.map((m) => m.nome ?? m.id),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[acqualatina/ordini/sync] fallito:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Sync dal master non riuscito.' },
      { status: 500 },
    );
  }
}
