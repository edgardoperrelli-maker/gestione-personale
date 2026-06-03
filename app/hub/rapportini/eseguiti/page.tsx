import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveUserRole } from '@/lib/moduleAccess';
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

export const dynamic = 'force-dynamic';

function oggiRoma(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

function fmtRisposta(tipo: string, val: unknown): string {
  if (tipo === 'crocetta') return val === true ? '✓' : '—';
  if (val == null || val === '') return '—';
  return String(val);
}

const TH = 'whitespace-nowrap px-3 py-2 text-left font-semibold';
const TD = 'whitespace-nowrap px-3 py-2';

type RapRow = { id: string; staff_name: string | null; data: string | null; stato: string | null; campi_snapshot: unknown; info_snapshot: unknown };
type VoceRow = VoceInfo & { id: string; rapportino_id: string; ordine: number; risposte: Record<string, unknown> | null };

export default async function EseguitiPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sp = await searchParams;
  const giorno = /^\d{4}-\d{2}-\d{2}$/.test(sp.data ?? '') ? (sp.data as string) : oggiRoma();

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  const { data: rapRows } = await supabase
    .from('rapportini')
    .select('id, staff_name, data, stato, campi_snapshot, info_snapshot')
    .eq('data', giorno)
    .order('staff_name', { ascending: true });
  const rapportini = (rapRows ?? []) as RapRow[];

  const rapIds = rapportini.map((r) => r.id);
  const { data: vociRows } = rapIds.length
    ? await supabase
        .from('rapportino_voci')
        .select('id, rapportino_id, ordine, nominativo, matricola, pdr, odsin, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte')
        .in('rapportino_id', rapIds)
        .order('ordine', { ascending: true })
    : { data: [] };
  const voci = (vociRows ?? []) as VoceRow[];
  const vociByRap = new Map<string, VoceRow[]>();
  for (const v of voci) {
    const arr = vociByRap.get(v.rapportino_id) ?? [];
    arr.push(v);
    vociByRap.set(v.rapportino_id, arr);
  }

  const totVoci = voci.length;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div>
        <Link href="/hub/mappa?vista=riepilogo" className="text-sm" style={{ color: 'var(--brand-primary)' }}>
          ← Riepilogo rapportini
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Interventi eseguiti
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {giorno} · {rapportini.length} rapportini · {totVoci} interventi · tutto a video, senza aprirli uno a uno.
        </p>
      </div>

      {rapportini.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessun rapportino per questo giorno.
        </div>
      ) : (
        rapportini.map((r) => {
          const info = resolveInfoCampi((r.info_snapshot ?? []) as TemplateInfoCampo[]);
          const campi = ((r.campi_snapshot ?? []) as TemplateCampo[]).slice().sort((a, b) => a.ordine - b.ordine);
          const vs = vociByRap.get(r.id) ?? [];
          return (
            <section key={r.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  {r.staff_name ?? 'Operatore'} <span className="text-sm font-normal" style={{ color: 'var(--brand-text-muted)' }}>· {vs.length} interventi · {r.stato ?? '—'}</span>
                </h2>
                <Link href={`/hub/rapportini/contenuto/${r.id}`} className="text-xs" style={{ color: 'var(--brand-primary)' }}>
                  Apri singolo →
                </Link>
              </div>
              {vs.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--brand-text-subtle)' }}>Nessun intervento.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr style={{ color: 'var(--brand-text-muted)' }}>
                        <th className={TD}>#</th>
                        {info.map((c) => <th key={`i-${c.chiave}`} className={TH}>{c.etichetta}</th>)}
                        {campi.map((c) => <th key={`c-${c.chiave}`} className={TH}>{c.etichetta}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {vs.map((v, i) => (
                        <tr key={v.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                          <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{i + 1}</td>
                          {info.map((c) => <td key={`i-${c.chiave}`} className={TD}>{valoreInfo(v, c.chiave) || '—'}</td>)}
                          {campi.map((c) => (
                            <td key={`c-${c.chiave}`} className={`${TD} text-center`}>{fmtRisposta(c.tipo, (v.risposte ?? {})[c.chiave])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
