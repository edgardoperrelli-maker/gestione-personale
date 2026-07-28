/* Hallmark · macrostructure: Workbench · design-system: DESIGN.md · vista: tassonomia attività */
import { caricaCommittenti } from '@/lib/contratti/dati';
import { committentiAttivi } from '@/lib/contratti/tipi';
import AttivitaTassonomiaClient, { type OpzioneCommittente } from './AttivitaTassonomiaClient';

export const dynamic = 'force-dynamic';

// I committenti del menu vengono dal REGISTRO (`committenti`, modulo Contratti) e non
// più da un elenco cablato nel client: apri una commessa nuova e la sua attività si può
// censire qui, senza toccare codice. Era il buco per cui AcquaLatina non compariva.
//
// «Altro» non è un committente e infatti non sta nel registro: in tassonomia è il
// catch-all che `risolviGruppo` sonda quando l'attività non appartiene a nessuno in
// particolare. Va in fondo perché è l'ultima spiaggia, non una scelta di pari rango.
const ALTRO: OpzioneCommittente = { codice: 'altro', nome: 'Altro' };

export default async function AttivitaTassonomiaPage() {
  const committenti = committentiAttivi(await caricaCommittenti())
    // Solo chi ha un codice di runtime: senza, non può comparire su `attivita_tassonomia`.
    .filter((c) => c.codice)
    .map((c) => ({ codice: c.codice as string, nome: c.nome }));

  return <AttivitaTassonomiaClient committenti={[...committenti, ALTRO]} />;
}
