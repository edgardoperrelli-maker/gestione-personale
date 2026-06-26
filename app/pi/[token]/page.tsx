import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import PILinkClient from '@/components/modules/pronto-intervento/campo/PILinkClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
