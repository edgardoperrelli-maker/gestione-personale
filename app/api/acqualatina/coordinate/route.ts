import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import {
  abbinaCoordinate, righeDaPayload, type OrdineDaCoordinare,
} from '@/lib/acqualatina/coordinateDaFile';

export const runtime = 'nodejs';
// Le scritture vanno una per riga e possono essere migliaia: stesso tetto del sync dal master,
// che fa lo stesso mestiere sugli stessi volumi.
export const maxDuration = 300;

const PAGINA = 1000;
const CONCORRENZA = 20;

/**
 * POST /api/acqualatina/coordinate — le coordinate GPS del committente sul registro.
 *
 * Riceve JSON, non il file. Il foglio lo legge il BROWSER: l'estrazione del committente dichiara
 * 835.771 righe per 4.195 di dati — 19 MB di righe fantasma — e una funzione serverless rifiuta i
 * body sopra ~4,5 MB prima ancora di svegliarsi (413, verificato in produzione il 06/08). Le
 * coordinate che contano sono 300 KB: si manda quelle. Il parsing resta la stessa funzione pura
 * (`parseCoordinateFile`), solo eseguita dall'altra parte del filo.
 *
 * Quello che il client manda non è fidato e viene ricontrollato (`righeDaPayload`): ogni
 * coordinata si ricalcola con `parseLatLng`, e chi non passa non entra.
 *
 * ARRICCHISCE e basta: aggiorna la colonna `coordinate` delle righe che il registro ha GIÀ,
 * agganciandole per COD_FORNITURA (l'impianto, che è il punto) e — quando la fornitura non si
 * trova — per ODL, coprendo tutte le operazioni di quell'ordine. Non inserisce mai una riga: una
 * fornitura che il modulo non conosce si conta e si dice.
 *
 * Non tocca né stati né pianificazione né anagrafica: la coordinata è un dato a parte, come nel
 * rapportino (design 2026-06-05) — non entra in geocoding, routing o mappa, che continuano a
 * lavorare sull'indirizzo. Idempotente: rimandare le stesse righe una seconda volta scrive zero.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo della richiesta non leggibile.' }, { status: 400 });
  }
  const payload = (body as { righe?: unknown } | null)?.righe;
  const righe = righeDaPayload(payload);
  if (righe.length === 0) {
    return NextResponse.json(
      { error: 'Nessuna riga con coordinate valide e un aggancio (CODODL o COD_FORNITURA).' },
      { status: 422 },
    );
  }

  try {
    // Il registro intero, paginato: l'abbinamento è per fornitura, che non è indicizzata — e
    // comunque una scansione sola costa meno di migliaia di query puntuali.
    const registro: OrdineDaCoordinare[] = [];
    for (let offset = 0; ; offset += PAGINA) {
      const { data, error } = await supabaseAdmin
        .from('acqualatina_ordini')
        .select('odl, numero_operazione, impianto, coordinate')
        .range(offset, offset + PAGINA - 1);
      if (error) throw error;
      const blocco = (data ?? []) as OrdineDaCoordinare[];
      registro.push(...blocco);
      if (blocco.length < PAGINA) break;
    }

    const { aggiornamenti, giaUguali, nonTrovate } = abbinaCoordinate(righe, registro);

    // Una `update` per riga (la chiave è la coppia), a blocchi concorrenti: stesso schema delle
    // correzioni anagrafiche del sync dal master.
    let aggiornate = 0;
    for (let i = 0; i < aggiornamenti.length; i += CONCORRENZA) {
      await Promise.all(aggiornamenti.slice(i, i + CONCORRENZA).map(async (a) => {
        const { error } = await supabaseAdmin
          .from('acqualatina_ordini')
          .update({ coordinate: a.coordinate })
          .eq('odl', a.odl)
          .eq('numero_operazione', a.numero_operazione);
        if (error) throw error;
        aggiornate += 1;
      }));
    }

    return NextResponse.json(
      { conCoordinate: righe.length, aggiornate, giaUguali, nonTrovate },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[acqualatina/coordinate] import fallito:', e);
    const msg = e instanceof Error ? e.message : 'Import delle coordinate non riuscito.';
    // La colonna nasce con la migration 20260806090000: senza, il messaggio dice cosa manca
    // invece di un «column does not exist» che non aiuta nessuno.
    return NextResponse.json(
      {
        error: /coordinate/i.test(msg) && /column|schema/i.test(msg)
          ? 'La colonna `coordinate` non esiste ancora sul registro: applica la migration 20260806090000_acqualatina_ordini_coordinate.sql.'
          : msg,
      },
      { status: 500 },
    );
  }
}
