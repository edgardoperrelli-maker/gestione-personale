import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { sincronizzaRapportiniAcea } from '@/lib/acea/sincronizzaRapportiniAcea';
import { anteprimeRapportini, parseCoppie } from '@/lib/acea/caricaSuRapportino';
import { riepilogoEsiti } from '@/lib/acea/vociRapportino';
import { parseFamiglia } from '@/lib/acea/famiglia';

export const runtime = 'nodejs';

/**
 * GET /api/acea/rapportini?coppia=staffId|data&coppia=… — l'anteprima della modale.
 *
 * Per ogni (operatore, giorno) dice se il rapportino ESISTE già — e in che stato, con quante
 * voci a bordo — o se ne nascerà uno: è la riga che la modale mostra PRIMA di generare, così la
 * conferma si legge invece di subirla. Sola lettura, mirata alle coppie chieste: mai una
 * scansione di tutti i rapportini.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const coppie = parseCoppie(new URL(req.url).searchParams.getAll('coppia'));
    if (coppie.length === 0) {
      return NextResponse.json({ anteprime: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // Soprainsieme (prodotto incrociato di date e operatori): lo riduce la funzione pura.
    const { data: rapRows, error } = await supabaseAdmin
      .from('rapportini')
      .select('id, staff_id, data, stato')
      .in('data', [...new Set(coppie.map((c) => c.data))])
      .in('staff_id', [...new Set(coppie.map((c) => c.staffId))]);
    if (error) throw error;
    const esistenti = (rapRows ?? []) as Array<{
      id: string; staff_id: string | null; data: string | null; stato: string | null;
    }>;

    const vociPerRapportino = new Map<string, number>();
    if (esistenti.length > 0) {
      const { data: voci, error: eVoci } = await supabaseAdmin
        .from('rapportino_voci')
        .select('rapportino_id')
        .in('rapportino_id', esistenti.map((r) => r.id));
      if (eVoci) throw eVoci;
      for (const v of (voci ?? []) as Array<{ rapportino_id: string | null }>) {
        if (!v.rapportino_id) continue;
        vociPerRapportino.set(v.rapportino_id, (vociPerRapportino.get(v.rapportino_id) ?? 0) + 1);
      }
    }

    return NextResponse.json(
      { anteprime: anteprimeRapportini(coppie, esistenti, vociPerRapportino) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore anteprima rapportini.' },
      { status: 500 },
    );
  }
}

type Corpo = {
  data?: string;
  staffIds?: string[];
  /** Riapre i rapportini già consegnati che devono ricevere voci nuove. */
  confermaRiaperture?: boolean;
  /** Genera comunque, pur essendoci righe pianificate a metà per quel giorno. */
  confermaIncomplete?: boolean;
  /** Famiglia della vista che genera: registro e committenti della commessa. Assente = ACEA. */
  famiglia?: string;
};

/**
 * POST /api/acea/rapportini — genera i rapportini del giorno per gli interventi ACEA pianificati.
 *
 * La prima chiamata è il passaggio sicuro: crea e aggiunge dove si può, e per i rapportini già
 * consegnati si ferma restituendo `richiede_riapertura`. L'admin vede riga per riga cosa è
 * successo e, se vuole riaprire, richiama con `confermaRiaperture`.
 *
 * È idempotente: rilanciarla non duplica niente (le voci ACEA sono agganciate al loro intervento),
 * quindi si può premere il pulsante ogni volta che si aggiunge lavoro a un giorno già generato —
 * che è esattamente il caso delle attivazioni assegnate in giornata.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const corpo = (await req.json()) as Corpo;
    const data = String(corpo.data ?? '').trim();
    const staffIds = Array.isArray(corpo.staffIds)
      ? corpo.staffIds.map((s) => String(s)).filter(Boolean)
      : undefined;

    const esito = await sincronizzaRapportiniAcea(supabaseAdmin, {
      data,
      attoreId: auth.user.id,
      staffIds,
      confermaRiaperture: corpo.confermaRiaperture === true,
      confermaIncomplete: corpo.confermaIncomplete === true,
      famiglia: parseFamiglia(corpo.famiglia),
    });

    if (!esito.ok) {
      // `incomplete` esce solo sul 409 delle righe a metà: la UI ne fa l'elenco da mostrare
      // prima di chiedere se generare lo stesso.
      return NextResponse.json(
        { error: esito.error, incomplete: esito.incomplete },
        { status: esito.status },
      );
    }
    return NextResponse.json(
      { esiti: esito.esiti, avvisi: esito.avvisi, riepilogo: riepilogoEsiti(esito.esiti) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore generazione rapportini.' },
      { status: 500 },
    );
  }
}
