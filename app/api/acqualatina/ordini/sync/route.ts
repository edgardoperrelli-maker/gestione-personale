import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { partiRoma } from '@/lib/orarioRoma';
import { COMMITTENTE_ACQUALATINA, ATTIVITA_SOSTITUZIONE_MISURATORE } from '@/lib/acqualatina/contratto';
import { ordiniDaMaster, type OrdineEsistente, type RigaMaster } from '@/lib/acqualatina/ordiniDaMaster';
// Lo stato della riga mai lavorata, dalla stessa fonte degli altri due: sono le voci dell'imbuto
// «Stato», e una scritta a mano qui diventerebbe una quarta voce che nessuno si aspetta.
import { STATO_APERTA } from '@/lib/acqualatina/chiusuraRegistro';

export const runtime = 'nodejs';

const PAGINA = 1000;

/**
 * POST /api/acqualatina/ordini/sync — allinea il registro al master del committente.
 *
 * ADDITIVO e idempotente: tira dentro le coppie (ODL, matricola) che il registro non ha ancora,
 * dai master ATTIVI del committente acqualatina (Impostazioni → Template master). Rilanciarlo a
 * vuoto non scrive niente. È il gesto per il file del mese nuovo: si carica il master, si preme qui.
 *
 * Delle righe già presenti tocca SOLO i campi anagrafici vuoti (cod. fornitura, nome utente,
 * recapito): la pianificazione che vive lì sopra resta intatta, e ricaricare un master più
 * completo diventa il modo di riempire i buchi invece di un gesto senza effetto.
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

    // 3) Cosa c'è già a registro: la funzione pura decide chiavi e numerazione.
    const esistenti: OrdineEsistente[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('odl, numero_operazione, matricola, impianto, nominativo, recapito')
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as OrdineEsistente[];
      esistenti.push(...blocco);
      if (blocco.length < PAGINA) break;
    }

    const masterDiRiga = new Map(righe.map((r) => [r.id, r.master_id]));
    const { nuovi, arricchimenti, giaPresenti, scartate } = ordiniDaMaster(righe, esistenti);

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
      5) I VUOTI che il master può riempire sulle righe già presenti.

      È l'unica scrittura di questo endpoint su una riga esistente, ed è ristretta ai campi
      anagrafici VUOTI (la funzione pura decide quali): la pianificazione, le note e gli stati
      non si toccano. Serve al caso reale — il file di luglio è entrato quando il parser non
      leggeva cod. fornitura, nome utente e recapito, e senza questo passaggio ricaricare il
      master completo non avrebbe cambiato niente sulle 4.196 righe già a registro.

      Una `update` per riga e non un upsert: l'upsert avrebbe bisogno di tutte le colonne NOT
      NULL della riga, e sbagliarne una vorrebbe dire riscrivere il registro invece di
      correggerlo. Le righe da toccare sono poche per costruzione (solo quelle con un vuoto),
      e al secondo sync dello stesso file sono zero.
    */
    for (const a of arricchimenti) {
      const { error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .update(a.patch)
        .eq('odl', a.odl)
        .eq('numero_operazione', a.numero_operazione);
      if (error) throw error;
    }

    return NextResponse.json(
      {
        inseriti: nuovi.length,
        arricchiti: arricchimenti.length,
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
