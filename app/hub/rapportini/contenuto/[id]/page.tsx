import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveUserRole } from '@/lib/moduleAccess';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { unioneCampi } from '@/utils/rapportini/campiDiVoce';
import RapportinoEditor, { type VoceEditabile } from '@/components/modules/rapportini/RapportinoEditor';

export const dynamic = 'force-dynamic';

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
    .select('id, staff_name, data, stato, campi_snapshot')
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

  const r = rap as { staff_name: string | null; data: string | null; stato: string | null; campi_snapshot: unknown };

  const { data: vociRows } = await supabase
    .from('rapportino_voci')
    .select('id, ordine, nominativo, matricola, pdr, odl, via, comune, cap, recapito, attivita, accessibilita, fascia_oraria, risposte, campi_snapshot')
    .eq('rapportino_id', id)
    .order('ordine', { ascending: true });

  // Colonne = unione campi rapportino + per-voce (flussi del gruppo attività), foto escluse
  // (non editabili in tabella).
  const campi = unioneCampi(
    (r.campi_snapshot ?? []) as TemplateCampo[],
    ((vociRows ?? []) as Array<{ campi_snapshot?: unknown }>).map((v) =>
      Array.isArray(v.campi_snapshot) ? (v.campi_snapshot as TemplateCampo[]) : null,
    ),
  ).filter((c) => c.tipo !== 'foto');
  const voci = (vociRows ?? []) as VoceEditabile[];

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
          {r.data ?? '—'} · {voci.length} interventi · stato {r.stato ?? '—'} · correggi gli esiti e premi &ldquo;Salva modifiche&rdquo;.
        </p>
      </div>

      {voci.length === 0 ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm" style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-muted)' }}>
          Nessun intervento registrato in questo rapportino.
        </div>
      ) : (
        <RapportinoEditor rapportinoId={id} vociIniziali={voci} campi={campi} />
      )}
    </main>
  );
}
