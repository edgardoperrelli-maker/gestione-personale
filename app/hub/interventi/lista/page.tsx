import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import InterventiFilters from '@/components/modules/interventi/InterventiFilters';
import InterventiTable, { type InterventoRow } from '@/components/modules/interventi/InterventiTable';
import { parseInterventiFilters } from '@/lib/interventi/interventiView';

export const dynamic = 'force-dynamic';

/** Data odierna in fuso Europe/Rome, formato YYYY-MM-DD. */
function oggiIso(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Rome' }).slice(0, 10);
}

export default async function ListaInterventiPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; committente?: string; stato?: string; geocode?: string }>;
}) {
  const sp = await searchParams;
  const filters = parseInterventiFilters(sp, oggiIso());

  const cookieStore = await cookies();
  const cookieMethods = (() => cookieStore) as unknown as () => ReturnType<typeof cookies>;
  const supabase = createServerComponentClient({ cookies: cookieMethods });

  let q = supabase
    .from('interventi')
    .select('id, odl, indirizzo, comune, committente, stato, geocode_status, nominativo, fascia_oraria')
    .eq('data', filters.data)
    .order('comune', { ascending: true })
    .order('indirizzo', { ascending: true })
    .limit(1000);
  if (filters.committente !== 'tutti') q = q.eq('committente', filters.committente);
  if (filters.stato !== 'tutti') q = q.eq('stato', filters.stato);
  if (filters.geocode !== 'tutti') q = q.eq('geocode_status', filters.geocode);

  const { data: rows, error } = await q;
  const interventi = (rows ?? []) as InterventoRow[];

  const conteggi = {
    totale: interventi.length,
    ok: interventi.filter((r) => r.geocode_status === 'ok').length,
    failed: interventi.filter((r) => r.geocode_status === 'failed').length,
    pending: interventi.filter((r) => r.geocode_status !== 'ok' && r.geocode_status !== 'failed').length,
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--brand-text-main)' }}>
            Interventi
          </h1>
          <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            Elenco degli interventi importati, filtrabile per data, committente, stato e geocodifica.
          </p>
        </div>
        <Link
          href="/hub/interventi"
          className="inline-flex w-fit items-center rounded-2xl border px-4 py-2 text-sm font-medium transition"
          style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-main)' }}
        >
          Importa interventi
        </Link>
      </header>

      <Suspense fallback={null}>
        <InterventiFilters filters={filters} />
      </Suspense>

      {error ? (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Errore nel caricamento: {error.message}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { k: 'Totale', v: conteggi.totale },
              { k: 'Geocodificati', v: conteggi.ok },
              { k: 'Da correggere', v: conteggi.failed },
              { k: 'In attesa', v: conteggi.pending },
            ].map((c) => (
              <div key={c.k} className="rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: 'var(--brand-text-muted)' }}>
                  {c.k}
                </div>
                <div className="mt-1 text-2xl font-semibold" style={{ color: 'var(--brand-text-main)' }}>
                  {c.v}
                </div>
              </div>
            ))}
          </div>

          <InterventiTable rows={interventi} />
        </>
      )}
    </main>
  );
}
