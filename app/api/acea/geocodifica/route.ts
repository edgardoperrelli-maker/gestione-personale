import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/apiAuth';
import { geocodeIndirizzoServer } from '@/lib/interventi/geocodeServer';
import { dentroLazio, ripieghiFuoriRegione, type Precisione } from '@/lib/acea/microaree';
import { ricalcolaGruppi } from '@/lib/acea/gruppiServer';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
type EsitoCoord = {
  lat: number;
  lng: number;
  esito: 'ok' | 'non_trovato' | 'fuori_regione';
  precisione: Precisione | null;
};

async function coordinateInLazio(
  via: string,
  civico: string,
  cap: string,
  comune: string,
): Promise<EsitoCoord> {
  const completo = [via, civico].filter(Boolean).join(' ').trim();

  const primo = await geocodeIndirizzoServer(completo, cap, comune);
  if (primo && dentroLazio(primo)) return { ...primo, esito: 'ok', precisione: 'civico' };

  // Il provider ha risposto, ma altrove: si rifà la stessa domanda ancorandola al territorio.
  if (primo) {
    const ancorato = await geocodeIndirizzoServer(completo, cap, `${comune}, Lazio`);
    if (ancorato && dentroLazio(ancorato)) {
      return { ...ancorato, esito: 'ok', precisione: 'civico' };
    }
  }

  /*
    Ancora fuori: si chiede MENO.

    A Roma la via senza civico (il comune sarebbe 1.285 km², un punto solo per l'Eur e Prima Porta);
    fuori Roma direttamente il comune, che è un punto sicuro dentro i suoi confini e fa ereditare
    la microarea giusta. Le regole stanno in `ripieghiFuoriRegione`, pure e testate.

    Il punto che ne esce è VERO ma grossolano: si segna la precisione, e il gruppo che ne nasce si
    mostra come stimato — «da queste parti», non «a 2 km da qui».
  */
  for (const t of ripieghiFuoriRegione(via, cap, comune)) {
    const r = await geocodeIndirizzoServer(t.indirizzo, t.indirizzo === '' ? '' : cap, t.citta);
    if (r && dentroLazio(r)) return { ...r, esito: 'ok', precisione: t.precisione };
  }

  if (primo) return { lat: primo.lat, lng: primo.lng, esito: 'fuori_regione', precisione: null };
  return { lat: 0, lng: 0, esito: 'non_trovato', precisione: null };
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

    const [totale, daFare, fuoriRegione, nonTrovati, conGruppo, stimati] = await Promise.all([
      conta((q) => q),
      conta((q) => q.is('geocodifica_esito', null)),
      conta((q) => q.eq('geocodifica_esito', 'fuori_regione')),
      conta((q) => q.eq('geocodifica_esito', 'non_trovato')),
      conta((q) => q.not('microarea', 'is', null).eq('microarea_stimata', false)),
      conta((q) => q.eq('microarea_stimata', true)),
    ]);

    return NextResponse.json(
      { totale, daFare, fuoriRegione, nonTrovati, conGruppo, stimati },
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

      const esito = await coordinateInLazio(r.via ?? '', r.civico ?? '', r.cap ?? '', r.comune);
      await supabaseAdmin
        .from('acea_ordini')
        .update({
          lat: esito.esito === 'ok' ? esito.lat : null,
          lng: esito.esito === 'ok' ? esito.lng : null,
          geocodifica_esito: esito.esito,
          geocodifica_precisione: esito.precisione,
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
      : { microaree: 0, senzaGruppo: 0, stimati: 0 };

    return NextResponse.json({ geocodificati: fatte, rimaste: rimaste ?? 0, ...gruppi });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Errore geocodifica.' },
      { status: 500 },
    );
  }
}
