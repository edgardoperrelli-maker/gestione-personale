import { assertKpiAccess } from '@/lib/performance/kpiGate';
import PresentazioneProduzione from '@/components/modules/performance/economica/PresentazioneProduzione';

export const dynamic = 'force-dynamic';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function trentaGiorniFa(oggi: string): string {
  const d = new Date(`${oggi}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Vista presentazione (fuori da /hub → nessuna AppShell): ?from&to, default ultimi 30 giorni. */
export default async function PresentazioneProduzioneAceaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await assertKpiAccess();
  const sp = await searchParams;
  const oggi = new Date().toISOString().slice(0, 10);
  const to = ISO.test(sp.to ?? '') ? (sp.to as string) : oggi;
  const from = ISO.test(sp.from ?? '') ? (sp.from as string) : trentaGiorniFa(to);
  return <PresentazioneProduzione from={from} to={to} />;
}
