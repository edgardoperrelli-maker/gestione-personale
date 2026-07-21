import { notFound } from 'next/navigation';
import RapportinoForm, { type Voce } from '@/components/modules/rapportini/RapportinoForm';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const dynamic = 'force-dynamic';

const CAMPI: TemplateCampo[] = [
  { chiave: 'esito', etichetta: 'Esito', tipo: 'crocetta', ordine: 1 },
];

/* Dati con titoli/attività lunghi: stressano il layout come i rapportini reali
   (BONIFICHE EXTRA + vie lunghe) sugli schermi stretti. */
const VOCI: Voce[] = [
  { id: 'v1', ordine: 1, nominativo: 'ROSSI MARIO', via: 'VIA DEL PONTE ALLE RIFFE', comune: 'FIRENZE', attivita: 'BONIFICHE EXTRA', fascia_oraria: '21/07/2026 08:00', risposte: { esito: 'SI' } },
  { id: 'v2', ordine: 2, nominativo: 'BIANCHI GIUSEPPE ANTONIO', via: 'VIA DELLE PANCHE LUNGHE 123', comune: 'FIRENZE', attivita: 'SOSTITUZIONE MISURATORE GAS', fascia_oraria: '21/07/2026 10:00', risposte: {}, notaUfficio: 'Citofonare interno 4' },
  { id: 'v3', ordine: 3, nominativo: 'VERDI FRANCESCA', via: 'VIA DEL PONTE ROSSO 45', comune: 'SESTO FIORENTINO', attivita: 'BONIFICHE EXTRA', risposte: {} },
  { id: 'v4', ordine: 4, nominativo: 'ESPOSITO SALVATORE', via: 'VIA DEL PONTE VECCHIO 7', comune: 'FIRENZE', attivita: 'BONIFICHE EXTRA', risposte: {}, nuovo: true },
  // Caso peggiore per la riga badge: voce manuale con "Nuovo" + "Sospeso" + nota + attività lunga.
  { id: 'v5', ordine: 5, nominativo: 'COLOMBO ALESSANDRO', via: 'VIA DELLE CASCINE 88', comune: 'FIRENZE', attivita: 'SOSTITUZIONE MISURATORE GAS', fascia_oraria: '21/07/2026 15:00', risposte: {}, nuovo: true, manuale: true, approvazione_stato: 'in_attesa', notaUfficio: 'Chiamare prima di passare' },
];

/** Fixture e2e: la LISTA rapportino con dati finti, per i test di layout
 *  responsive (niente Supabase). Disponibile SOLO fuori produzione.
 *  `?inviato=1` rende lo stato post-invio (barra con condivisione PDF). */
export default async function ListaFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ inviato?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { inviato } = await searchParams;
  return (
    <main className="min-h-dvh bg-[var(--brand-bg)] text-[var(--brand-text-main)]">
      <RapportinoForm
        token="e2e-lista"
        rapportino={{ staff_name: 'BRUNELLI GIANLUCA', data: '2026-07-21' }}
        voci={VOCI}
        campiSnapshot={CAMPI}
        infoCampi={[]}
        readOnly={inviato === '1'}
      />
    </main>
  );
}
