import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import AgendaOperatoreClient, { type AgendaIntervento } from '@/components/modules/agenda/AgendaOperatoreClient';
import { ServiceWorkerRegister } from '@/components/offline/ServiceWorkerRegister';
import { BrandHeader } from '@/components/brand/BrandHeader';
import { BRAND, appBaseUrl, dataItaliana } from '@/lib/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome (YYYY-MM-DD). */
function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

/** Anteprima ricca (Open Graph) per la condivisione su WhatsApp: nome operatore e data. */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const base = appBaseUrl();
  const { data: tok } = await supabaseAdmin
    .from('agenda_token')
    .select('staff_id, data')
    .eq('token', token)
    .maybeSingle();
  if (!tok) return { metadataBase: new URL(base), title: `Agenda operatore — ${BRAND.nomeLegale}` };
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('display_name')
    .eq('id', (tok as { staff_id: string }).staff_id)
    .maybeSingle();
  const nome = (staff as { display_name?: string | null } | null)?.display_name ?? '';
  const titolo = `🗓️ Agenda${nome ? ` · ${nome}` : ''}`;
  const desc = `Il giro di interventi del ${dataItaliana((tok as { data?: string }).data)} — tocca per vederlo e segnare gli esiti.`;
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--brand-bg)] px-4 text-[var(--brand-text-main)]">
      <div className="mb-6">
        <BrandHeader />
      </div>
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--brand-surface)] p-8 text-center shadow-sm"
        style={{ borderColor: 'var(--brand-border)' }}
      >
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {message}
        </p>
      </div>
    </main>
  );
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
    return <Avviso title="Agenda non trovata" message="Il link non è valido. Contatta l'ufficio." />;
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
