import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveUserRole } from '@/lib/moduleAccess';
import { resolveInfoCampi, valoreInfo, type TemplateInfoCampo, type VoceInfo } from '@/utils/rapportini/infoCampi';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { colonneVisibili } from '@/utils/rapportini/colonneVisibili';

export const dynamic = 'force-dynamic';

/** Rende leggibile una risposta in base al tipo di campo del template. */
function fmtRisposta(tipo: string, val: unknown): string {
  if (tipo === 'crocetta') return val === true ? '✓' : '—';
  if (val == null || val === '') return '—';
  return String(val);
}

const TH = 'whitespace-nowrap px-3 py-2 text-left font-semibold';
const TD = 'whitespace-nowrap px-3 py-2';

export default async function ContenutoRapportinoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (resolveUserRole(profile?.role, user.app_metadata?.role) !== 'admin') redirect('/hub');

  const { data: rap } = await supabase
    .from('rapportini')
    .select('id, staff_name, data, stato, campi_snapshot, info_snapshot')
    .eq('id', id)
    .maybeSingle();

  if (!rap) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Rapportino non trovato.</p>
        <Link href="/hub/mappa?vista=riepilogo" className="mt-3 inline-block text-sm" style={{ color: 'var(--brand-primary)' }}>
          ← Torna al riepilogo
        </Link>
      </main>
    );
  }

  const r = rap as {
    staff_name: string | null;
    data: string | null;
    stato: string | null;
    campi_snapshot: unknown;
    info_snapshot: unknown;
  };

  const { data: vociRows } = await supabase
    .from('rapportino_voci')
    .select('id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte')
    .eq('rapportino_id', id)
    .order('ordine', { ascending: true });

  const info = resolveInfoCampi((r.info_snapshot ?? []) as TemplateInfoCampo[]);
  const campi = ((r.campi_snapshot ?? []) as TemplateCampo[]).slice().sort((a, b) => a.ordine - b.ordine);
  const voci = (vociRows ?? []) as Array<
    VoceInfo & { id: string; ordine: number; risposte: Record<string, unknown> | null }
  >;
  const { info: infoVis, campi: campiVis } = colonneVisibili(info, campi, voci);

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-6 py-8">
      <div>
        <Link href="/hub/mappa?vista=riepilogo" className="text-sm" style={{ color: 'var(--brand-primary)' }}>
          ← Riepilogo rapportini
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
          Rapportino · {r.staff_name ?? 'Operatore'}
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          {r.data ?? '—'} · {voci.length} interventi · stato {r.stato ?? '—'}
        </p>
      </div>

      {voci.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessun intervento registrato in questo rapportino.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: 'var(--brand-border)' }}>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--brand-text-muted)' }}>
                <th className={TD}>#</th>
                {infoVis.map((c) => (
                  <th key={`i-${c.chiave}`} className={TH}>{c.etichetta}</th>
                ))}
                {campiVis.map((c) => (
                  <th key={`c-${c.chiave}`} className={TH}>{c.etichetta}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {voci.map((v, i) => (
                <tr key={v.id} className="border-t" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}>
                  <td className={TD} style={{ color: 'var(--brand-text-muted)' }}>{i + 1}</td>
                  {infoVis.map((c) => (
                    <td key={`i-${c.chiave}`} className={TD}>{valoreInfo(v, c.chiave) || '—'}</td>
                  ))}
                  {campiVis.map((c) => (
                    <td key={`c-${c.chiave}`} className={`${TD} text-center`}>
                      {fmtRisposta(c.tipo, (v.risposte ?? {})[c.chiave])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
