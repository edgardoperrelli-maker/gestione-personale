import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';
import { matricoleSimili } from '@/lib/limitazione/matricoleSimili';
import { matchVociMatricola } from '@/lib/limitazione/matchVociMatricola';
import { decidiConFonteViva, unisciCensiti } from '@/lib/limitazione/ricercaMisuratore';
import {
  candidatiMassivePerContenimento, candidatiMassivePerPrefisso,
} from '@/lib/acea/caricaCensitiMassive';
import { leggiVerdettoEsecuzione, escLike } from '@/lib/limitazione/leggiVerdettoEsecuzione';

export const runtime = 'nodejs';

const COMMITTENTE_LIMITAZIONE = 'acea';
const CAMPI = 'matricola, pdr, nominativo, indirizzo, civico, comune, cap, odl';

type RigaRef = {
  matricola: string; pdr: string | null; nominativo: string | null;
  indirizzo: string | null; civico: string | null; comune: string | null; cap: string | null;
  odl: string | null;
};

/*
  ---- DUE FONTI, il REGISTRO per primo -------------------------------------------------------

  `limitazione_misuratori_ref` è la fonte CONGELATA: la riempiva l'agente leggendo i master
  SharePoint, e si è fermata su ZAGAROLO e LABICO. `acea_ordini` è quella VIVA, che si aggiorna
  a ogni import del Cruscotto e conosce i paesi nuovi.

  Finché si cercava solo nella prima, un misuratore di RIANO non si trovava: l'operatore lo
  inseriva a mano, l'intervento nasceva senza ODL, e senza ODL il modulo Limitazioni massive non
  ha nulla a cui agganciarlo — registro e interventi si incrociano per ODL e basta. Il 31/07 sono
  stati 19 eseguiti invisibili in un giorno solo.

  Non si sostituiscono, come per i comuni (`lib/produzione/comuniMassive.ts`): durante la
  transizione una delle due può non avere una riga che l'altra ha. Chi vince quando parlano
  entrambe lo decide `decidiConFonteViva`, che è dove sta la regola e i suoi perché.
*/

const censitoDaRef = (r: RigaRef): CensitoMisuratore => ({
  matricola: r.matricola,
  pdr: r.pdr,
  nominativo: r.nominativo,
  indirizzo: r.indirizzo,
  civico: r.civico,
  comune: r.comune,
  cap: r.cap,
  odl: r.odl,
});

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini').select('id, stato, data, riaperto_at, piano_id, staff_id').eq('token', token).maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tokenStatus(rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null }, new Date().toISOString()) !== 'valido')
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });

  // Conflitto: stesso piano, altro operatore con quella matricola tra i suoi task.
  let altroOperatore: string | null = null;
  const pianoId = (rap as { piano_id?: string | null }).piano_id ?? null;
  const staffId = (rap as { staff_id?: string | null }).staff_id ?? '';
  if (pianoId) {
    const { data: altri } = await supabaseAdmin
      .from('rapportini').select('id, staff_name').eq('piano_id', pianoId).neq('staff_id', staffId);
    const nomePerRapp = new Map<string, string>(
      ((altri ?? []) as Array<{ id: string; staff_name: string | null }>).map((r) => [r.id, r.staff_name ?? '']),
    );
    if (nomePerRapp.size > 0) {
      const { data: vociAltri } = await supabaseAdmin
        .from('rapportino_voci').select('matricola, rapportino_id')
        .in('rapportino_id', [...nomePerRapp.keys()]).not('matricola', 'is', null).limit(2000);
      const hit = matchVociMatricola(
        ((vociAltri ?? []) as Array<{ matricola: string | null; rapportino_id: string }>)
          .map((v) => ({ id: v.rapportino_id, matricola: v.matricola })),
        q,
      );
      if (hit) altroOperatore = nomePerRapp.get(hit.id) || null;
    }
  }

  // Verdetto anti-duplicato (matricola già eseguita): valutato sempre, incluso in ogni risposta.
  const esecuzione = await leggiVerdettoEsecuzione(q);

  /*
    1) MATCH ESATTO. Le due letture in parallelo: è la strada che si paga a ogni scansione andata
    a buon fine, e in campo si aspetta col telefono in mano davanti a un contatore.

    Dal registro arrivano anche i TRONCONI (la matricola letta meno le cifre che l'export taglia):
    costano lo stesso `in` dell'esatto e servono al passo 2, dove `matricoleSimili` li riconosce.
    Il degrado è dichiarato: se il registro non si legge si va avanti con la sola fonte storica —
    una ricerca che non trova è meglio di una ricerca che non risponde.
  */
  const [daRegistro, esattiRef] = await Promise.all([
    candidatiMassivePerPrefisso(supabaseAdmin, q).catch((e): CensitoMisuratore[] => {
      console.error('[cerca-limitazione] registro non letto:', e);
      return [];
    }),
    supabaseAdmin
      .from('limitazione_misuratori_ref')
      .select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE)
      .eq('matricola', q)
      .limit(1),
  ]);
  const daRef = ((esattiRef.data ?? []) as RigaRef[]).map(censitoDaRef);

  const esito = decidiConFonteViva(q, daRegistro, daRef);
  if (esito.trovato) {
    return NextResponse.json({ trovato: true, misuratore: esito.misuratore, altroOperatore, esecuzione });
  }
  // Più ordini APERTI sulla stessa matricola (tronconi condivisi): l'ambiguità si mostra invece di
  // risolverla a caso — cinque indirizzi diversi, e l'indirizzo lo sa chi è sul posto.
  if (esito.ambigui) {
    // `ambigui`: la lista non è un «forse intendevi» — sono tutti la matricola cercata, su ordini
    // diversi. Chi legge deve sapere che sta scegliendo l'indirizzo, non correggendo un refuso.
    return NextResponse.json({
      trovato: false, ambigui: true, suggerimenti: esito.suggerimenti, altroOperatore, esecuzione,
    });
  }

  /*
    2) nessun esatto → suggerimenti simili (bidirezionali), dalle due fonti:
       (a) i candidati del registro: i tronconi già scesi al passo 1 più il «contiene»;
       (b) pre-filtro SQL ilike '%q%' sulla fonte storica = "candidato contiene q";
       (c) campione ordinato del dataset acea (fino a 2000) per il caso inverso "q contiene candidato".
       La pura matricoleSimili decide ordine e taglio a 8 sull'unione deduplicata.
  */
  const [contenuti, resLike, resSample] = await Promise.all([
    candidatiMassivePerContenimento(supabaseAdmin, q).catch((e): CensitoMisuratore[] => {
      console.error('[cerca-limitazione] registro (contenimento) non letto:', e);
      return [];
    }),
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).ilike('matricola', `%${escLike(q)}%`).limit(50),
    supabaseAdmin.from('limitazione_misuratori_ref').select(CAMPI)
      .eq('committente', COMMITTENTE_LIMITAZIONE).order('matricola', { ascending: true }).limit(2000),
  ]);
  const pool = unisciCensiti(
    daRegistro,
    contenuti,
    ([...(resLike.data ?? []), ...(resSample.data ?? [])] as RigaRef[]).map(censitoDaRef),
  );
  const suggerimenti = matricoleSimili(q, pool, 8);
  return NextResponse.json({ trovato: false, suggerimenti, altroOperatore, esecuzione });
}
