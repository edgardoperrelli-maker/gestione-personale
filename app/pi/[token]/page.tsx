import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import PILinkClient from '@/components/modules/pronto-intervento/campo/PILinkClient';
import Avviso from '@/components/ui/Avviso';
import { BRAND, appBaseUrl } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Anteprima del link: titolo/descrizione generici. Foglia e periodo di validità
 *  stanno SOLO nell'immagine (opengraph-image), senza ripeterli nel testo della card. */
export function generateMetadata(): Metadata {
  const titolo = '🔧 Pronto Intervento';
  const desc = BRAND.tagline;
  return {
    metadataBase: new URL(appBaseUrl()),
    title: titolo,
    description: desc,
    openGraph: { title: titolo, description: desc, type: 'website' },
    twitter: { card: 'summary_large_image', title: titolo, description: desc },
  };
}

export default async function ProntoInterventoLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: tok } = await supabaseAdmin.from('pi_token').select('id').eq('token', token).maybeSingle();
  if (!tok) {
    return <Avviso title="Link non trovato" message="Il link di Pronto Intervento non è valido. Contatta l'ufficio." />;
  }
  return (
    <>
      <ServiceWorkerRegister />
      <PILinkClient token={token} />
    </>
  );
}
