// Testa delle viste figlie del modulo Contratti — pattern «foglietta» (§7bis) con
// testa SLIM (§7ter: l'ObjectHeader resta alla landing; le viste figlie con
// Breadcrumb stanno sul pattern slim). Breadcrumb di rientro + titolo della vista
// corrente + FogliettaCard verso le altre due.

import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';
import { VISTE, altreViste, type VistaContratti } from './viste';

export default function ContrattiNav({
  attiva,
  azioni,
}: {
  attiva: VistaContratti;
  /** Azioni primarie della vista (es. «Nuovo committente»), a destra del titolo. */
  azioni?: React.ReactNode;
}) {
  const corrente = VISTE[attiva];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Breadcrumb
            items={[
              { label: 'Impostazioni', href: '/impostazioni' },
              { label: 'Contratti', href: '/impostazioni/contratti' },
              { label: corrente.titolo },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">
            {corrente.titolo}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--brand-text-muted)]">{corrente.desc}</p>
        </div>
        {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {altreViste(attiva).map((v) => (
          <FogliettaCard key={v.href} href={v.href} title={v.titolo} description={v.desc} />
        ))}
      </div>
    </div>
  );
}
