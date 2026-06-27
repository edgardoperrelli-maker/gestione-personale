import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import PILinkClient from '@/components/modules/pronto-intervento/campo/PILinkClient';
import { BRAND, appBaseUrl, dataItaliana as fmtDataIt } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Anteprima ricca (Open Graph) per la condivisione su WhatsApp: titolo con la foglia
 *  e il periodo di validità, così nel gruppo reperibilità il link attivo è riconoscibile. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const { data: tok } = await supabaseAdmin
    .from('pi_token')
    .select('area_codice, valido_dal, valido_al, revocato_at')
    .eq('token', token)
    .maybeSingle();
  if (!tok) return { title: `Pronto Intervento — ${BRAND.nomeLegale}` };
  const { data: area } = await supabaseAdmin.from('pi_aree').select('label').eq('codice', tok.area_codice).maybeSingle();
  const label = (area as { label?: string } | null)?.label;
  const revocato = !!tok.revocato_at;
  const titolo = `🔧 Pronto Intervento${label ? ` · ${label}` : ''}`;
  const desc = revocato
    ? 'Link revocato dall’ufficio.'
    : `Link attivo dal ${fmtDataIt(tok.valido_dal)} al ${fmtDataIt(tok.valido_al)} — tocca per registrare le chiamate P.I.`;
  const base = appBaseUrl();
  return {
    metadataBase: new URL(base),
    title: titolo,
    description: desc,
    openGraph: { title: titolo, description: desc, type: 'website' },
    twitter: { card: 'summary_large_image', title: titolo, description: desc },
  };
}

function Avviso({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--brand-bg)] px-4 text-[var(--brand-text-main)]">
      <div className="w-full max-w-md rounded-2xl border bg-[var(--brand-surface)] p-8 text-center shadow-sm" style={{ borderColor: 'var(--brand-border)' }}>
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--brand-text-muted)' }}>{message}</p>
      </div>
    </main>
  );
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
