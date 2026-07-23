import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AgendaOperatoreClient, { type AgendaIntervento } from '@/components/modules/agenda/AgendaOperatoreClient';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import Avviso from '@/components/ui/Avviso';
import { BRAND, appBaseUrl } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/** Anteprima del link: titolo/descrizione generici. Saluto col nome, data e
 *  istruzioni stanno SOLO nell'immagine (opengraph-image), senza ripetizioni. */
export function generateMetadata(): Metadata {
  const titolo = '🗓️ Agenda';
  const desc = BRAND.tagline;
  return {
    metadataBase: new URL(appBaseUrl()),
    title: titolo,
    description: desc,
    openGraph: { title: titolo, description: desc, type: 'website' },
    twitter: { card: 'summary_large_image', title: titolo, description: desc },
  };
}

export default async function AgendaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: tokRow } = await supabaseAdmin
    .from('agenda_token')
    .select('staff_id, data')
    .eq('token', token)
    .maybeSingle();
  const tok = tokRow as { staff_id: string; data: string } | null;

  if (!tok) {
    return <Avviso brand title="Agenda non trovata" message="Il link non è valido. Contatta l'ufficio." />;
  }

  const { data: staffRow } = await supabaseAdmin
    .from('staff')
    .select('display_name')
    .eq('id', tok.staff_id)
    .maybeSingle();

  const { data: rows } = await supabaseAdmin
    .from('interventi')
    .select('id, odl, nominativo, indirizzo, comune, pdr, fascia_oraria, committente, stato, esito, esito_motivo')
    .eq('staff_id', tok.staff_id)
    .eq('data', tok.data)
    .order('comune', { ascending: true })
    .order('indirizzo', { ascending: true });

  return (
    <>
      <ServiceWorkerRegister />
      <AgendaOperatoreClient
        token={token}
        operatore={(staffRow as { display_name?: string } | null)?.display_name ?? tok.staff_id}
        data={tok.data}
        readOnly={tok.data !== oggiRoma()}
        interventi={(rows ?? []) as AgendaIntervento[]}
      />
    </>
  );
}
