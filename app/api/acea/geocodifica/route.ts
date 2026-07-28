import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';
import { assegnaGruppi, dentroLazio, type PuntoOrdine } from '@/lib/acea/microaree';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PAGINA_SCAN = 1000;

/**
 * Quanti indirizzi per chiamata.
 *
 * Nominatim consente 1 richiesta al secondo per IP (è la sua usage policy, e la coda seriale di
 * `geocodingCore` la rispetta): 40 indirizzi sono ~40 secondi, dentro il minuto di `maxDuration`.
 * Gli indirizzi già visti escono dalla cache e non contano, quindi in pratica un blocco ne copre
 * molti di più. Il pulsante si ripreme finché il contatore non arriva a zero.
 */
const PER_BLOCCO = 40;

type RigaDaGeocodificare = {
  odl: string;
  numero_operazione: string;
  via: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
};

const indirizzoDi = (r: RigaDaGeocodificare) => [r.via, r.civico].filter(Boolean).join(' ').trim();

/** Chiave di ciò che è stato geocodificato: se cambia, le coordinate vanno rifatte. */
const chiaveDi = (r: RigaDaGeocodificare) =>
  `${indirizzoDi(r)}|${r.cap ?? ''}|${r.comune ?? ''}`.toUpperCase();

/**
 * Coordinate di un indirizzo, con il Lazio come vincolo.
 *
 * La patologia di questi provider non è il silenzio, è la risposta sbagliata: su un indirizzo
 * ambiguo Nominatim restituisce volentieri l'omonimo di un'altra regione — «VIA ROMA 1» esiste
 * ovunque. Un punto a Milano non produce un gruppo sbagliato, ne produce uno INVENTATO, e una
 * squadra manderebbe una giornata a inseguire un giro che non esiste.
 *
 * Quindi il primo risultato fuori regione non viene accettato: si riprova forzando la
 * localizzazione — comune + provincia + regione nel campo città — e se anche il secondo tentativo
 * esce dal Lazio la riga resta senza gruppo, marcata `fuori_regione`. Senza gruppo si vede; con un
 * gruppo sbagliato no.
 */
async function coordinateInLazio(
  indirizzo: string,
  cap: string,
  comune: string,
): Promise<{ lat: number; lng: number; esito: 'ok' | 'non_trovato' | 'fuori_regione' }> {
  const primo = await geocodeIndirizzoServer(indirizzo, cap, comune);
  if (primo && dentroLazio(primo)) return { ...primo, esito: 'ok' };

  if (primo) {
    // Il provider ha risposto, ma altrove: si rifà la domanda ancorandola al territorio.
    const secondo = await geocodeIndirizzoServer(indirizzo, cap, `${comune}, Lazio`);
    if (secondo && dentroLazio(secondo)) return { ...secondo, esito: 'ok' };
    return { lat: primo.lat, lng: primo.lng, esito: 'fuori_regione' };
  }

  return { lat: 0, lng: 0, esito: 'non_trovato' };
}

/** Ricalcola i numeri di microarea su TUTTO il registro e li scrive. */
async function ricalcolaGruppi(): Promise<{ microaree: number; senzaGruppo: number }> {
  const punti: PuntoOrdine[] = [];
  const perChiave = new Map<string, { odl: string; numero_operazione: string }>();

  for (let offset = 0; ; offset += PAGINA_SCAN) {
    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl, numero_operazione, comune, lat, lng')
      .order('odl', { ascending: true })
      .order('numero_operazione', { ascending: true })
      .range(offset, offset + PAGINA_SCAN - 1);
    if (error) throw error;
    const blocco = (data ?? []) as Array<{
      odl: string; numero_operazione: string; comune: string | null;
      lat: number | null; lng: number | null;
    }>;
    for (const r of blocco) {
      const chiave = `${r.odl}|${r.numero_operazione}`;
      perChiave.set(chiave, { odl: r.odl, numero_operazione: r.numero_operazione });
      punti.push({
        chiave,
        comune: r.comune,
        coord: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null,
      });
    }
    if (blocco.length < PAGINA_SCAN) break;
  }

  const gruppi = assegnaGruppi(punti);

  // Si scrive riga per riga solo dove il numero è definito; le altre restano a `null`, che è già
  // il loro valore. Un `update` per riga sarebbe lentissimo: si raggruppa per numero e si aggiorna
  // un gruppo alla volta con un `or` sulle chiavi.
  const perNumero = new Map<number, string[]>();
  for (const [chiave, n] of gruppi.perRiga) {
    const elenco = perNumero.get(n);
    if (elenco) elenco.push(chiave);
    else perNumero.set(n, [chiave]);
  }

  for (const [n, chiavi] of perNumero) {
    const odls = [...new Set(chiavi.map((k) => k.split('|')[0]))];
    for (let i = 0; i < odls.length; i += 200) {
      const { error } = await supabaseAdmin
        .from('acea_ordini')
        .update({ microarea: n })
        .in('odl', odls.slice(i, i + 200));
      if (error) throw error;
    }
  }

  return { microaree: gruppi.totale, senzaGruppo: gruppi.senzaGruppo };
}

/** GET — a che punto è la geocodifica. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const conta = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
      const { count, error } = await build(base());
      if (error) throw error;
      return count ?? 0;
    };
    function base() {
      return supabaseAdmin.from('acea_ordini').select('odl', { count: 'exact', head: true });
    }

    const [totale, daFare, fuoriRegione, nonTrovati, conGruppo] = await Promise.all([
      conta((q) => q),
      conta((q) => q.is('geocodifica_esito', null)),
      conta((q) => q.eq('geocodifica_esito', 'fuori_regione')),
      conta((q) => q.eq('geocodifica_esito', 'non_trovato')),
      conta((q) => q.not('microarea', 'is', null)),
    ]);

    return NextResponse.json(
      { totale, daFare, fuoriRegione, nonTrovati, conGruppo },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore stato geocodifica.' },
      { status: 500 },
    );
  }
}

/**
 * POST — un blocco di geocodifica, poi il ricalcolo dei gruppi.
 *
 * `?azione=gruppi` salta la geocodifica e rinumera soltanto: serve quando le coordinate ci sono
 * già e si vuole ripartire dalla griglia.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  try {
    const azione = new URL(req.url).searchParams.get('azione');

    if (azione === 'gruppi') {
      return NextResponse.json({ ...(await ricalcolaGruppi()), geocodificati: 0, rimaste: 0 });
    }

    const { data, error } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl, numero_operazione, via, civico, cap, comune')
      .is('geocodifica_esito', null)
      .order('comune', { ascending: true })   // stesso comune di fila: la cache lavora meglio
      .order('via', { ascending: true })
      .limit(PER_BLOCCO);
    if (error) throw error;

    const righe = (data ?? []) as RigaDaGeocodificare[];
    let fatte = 0;

    for (const r of righe) {
      const indirizzo = indirizzoDi(r);
      const adesso = new Date().toISOString();

      if (!indirizzo || !r.comune) {
        // Senza indirizzo non c'è niente da chiedere: si marca e si va avanti, invece di
        // ripresentare la stessa riga a ogni blocco e non finire mai.
        await supabaseAdmin
          .from('acea_ordini')
          .update({ geocodifica_esito: 'senza_indirizzo', geocodifica_at: adesso, geocodifica_chiave: chiaveDi(r) })
          .eq('odl', r.odl)
          .eq('numero_operazione', r.numero_operazione);
        continue;
      }

      const esito = await coordinateInLazio(indirizzo, r.cap ?? '', r.comune);
      await supabaseAdmin
        .from('acea_ordini')
        .update({
          lat: esito.esito === 'ok' ? esito.lat : null,
          lng: esito.esito === 'ok' ? esito.lng : null,
          geocodifica_esito: esito.esito,
          geocodifica_at: adesso,
          geocodifica_chiave: chiaveDi(r),
        })
        .eq('odl', r.odl)
        .eq('numero_operazione', r.numero_operazione);
      fatte += 1;
    }

    const { count: rimaste } = await supabaseAdmin
      .from('acea_ordini')
      .select('odl', { count: 'exact', head: true })
      .is('geocodifica_esito', null);

    // I gruppi si rinumerano solo quando il registro è tutto geocodificato: rinumerare a metà
    // darebbe numeri che cambiano a ogni blocco, cioè inutilizzabili.
    const gruppi = (rimaste ?? 0) === 0
      ? await ricalcolaGruppi()
      : { microaree: 0, senzaGruppo: 0 };

    return NextResponse.json({ geocodificati: fatte, rimaste: rimaste ?? 0, ...gruppi });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore geocodifica.' },
      { status: 500 },
    );
  }
}
