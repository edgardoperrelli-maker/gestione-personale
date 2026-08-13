// Ricerca del misuratore sul censimento AcquaLatina per il "+" dal campo.
//
// Separata da /cerca-limitazione, che serve ACEA: fonti diverse (là
// `limitazione_misuratori_ref`, qui il registro `acqualatina_ordini`), verso del lookup diverso
// (là la matricola È la chiave, qui il censimento è indicizzato per ODL e la matricola è il verso
// inverso) e soprattutto SEMANTICA OPPOSTA a valle — là il non-censito è un avviso morbido
// con «inserisci a mano», qui è un blocco. Tenerle nella stessa route significherebbe due
// corpi disgiunti dietro un parametro, col rischio di muovere il percorso ACEA vivo.
//
// Il verdetto lo calcola `lookupMaster` (PURA): la stessa funzione decide anche offline
// sulla cache locale, così «non censito» significa la stessa cosa con e senza rete. `q` può
// essere una matricola o un ODL: chi è sul posto legge il contatore, chi parte dal battente ha
// in mano l'ordine, e la route non chiede all'operatore di sapere quale dei due sta digitando.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tokenStatus } from '@/utils/rapportini/tokenStatus';
import { lookupMaster, type RigaMaster } from '@/lib/acqualatina/lookupMaster';
import { candidatiPerRicerca, totaleCensimento } from '@/lib/acqualatina/censimentoMaster';
import type { CensitoMisuratore } from '@/lib/limitazione/autofillAnagrafica';

export const runtime = 'nodejs';

/** RigaMaster → forma attesa da `autofillAnagrafica`, che è già quella del percorso ACEA.
 *  Il censimento AcquaLatina non porta `pdr` né `nominativo` (un misuratore d'acqua non ha un
 *  punto di riconsegna gas) e non porta il calibro: quello lo mette `calibroConDefault`
 *  (DN15 di capitolato). `indirizzo` finisce in `via`; `civico` è già dentro l'indirizzo. */
const censito = (r: RigaMaster): CensitoMisuratore => ({
  matricola: r.matricola,
  odl: r.odl,
  indirizzo: r.indirizzo,
  comune: r.comune,
  cap: r.cap,
});

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ error: 'q obbligatorio' }, { status: 400 });

  const { data: rap } = await supabaseAdmin
    .from('rapportini')
    .select('id, stato, data, riaperto_at')
    .eq('token', token)
    .maybeSingle();
  if (!rap) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (
    tokenStatus(
      rap as { stato: 'in_corso' | 'inviato' | 'scaduto'; data: string; riaperto_at: string | null },
      new Date().toISOString(),
    ) !== 'valido'
  ) {
    return NextResponse.json({ error: 'non_modificabile' }, { status: 409 });
  }

  const verdetto = lookupMaster(q, await candidatiPerRicerca(q));

  switch (verdetto.esito) {
    case 'letterale':
      // Match carattere per carattere: si procede senza chiedere niente.
      return NextResponse.json({ esito: 'letterale', misuratore: censito(verdetto.riga) });

    case 'conferma':
      // Normalizzato, simile, o agganciato all'ODL: serve il secondo tocco dell'operatore sulla
      // matricola. `motivo` viaggia perché la domanda da fare cambia — vedi CercaMatricolaAcqualatina.
      return NextResponse.json({
        esito: 'conferma',
        motivo: verdetto.motivo,
        candidati: verdetto.candidati.map(censito),
      });

    case 'ambiguo':
      // Più ODL sulla stessa matricola con indirizzi indistinguibili: il censimento è rotto su
      // quella riga e nessuno in campo può scegliere. Gli ODL servono all'ufficio.
      return NextResponse.json({ esito: 'ambiguo', odl: verdetto.odl });

    default:
      // `censimentoVuoto` NON cambia cosa vede l'operatore (blocco in entrambi i casi): serve a
      // distinguere «codice sconosciuto» da «registro della commessa vuoto», che è un problema
      // di configurazione e va detto all'ufficio con parole diverse.
      return NextResponse.json({ esito: 'assente', masterVuoto: (await totaleCensimento()) === 0 });
  }
}
