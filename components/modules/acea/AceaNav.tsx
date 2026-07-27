// Header delle viste del modulo ACEA — pattern «foglietta» (DESIGN.md §7bis):
// breadcrumb + titolo della vista corrente, FogliettaCard verso le viste gemelle.
import { Droplets, Gauge, Waves } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';

export type VistaAcea = 'hub' | 'dunning' | 'massive' | 'misuratori';

const ICON = { size: 18, strokeWidth: 1.75 } as const;

export const VISTE_ACEA = {
  dunning: {
    titolo: 'Dunning',
    href: '/hub/acea/dunning',
    desc: 'Import, pianificazione interventi e scadenze',
    icon: <Droplets {...ICON} />,
  },
  massive: {
    titolo: 'Limitazioni massive',
    href: '/hub/acea/massive',
    desc: 'Stato degli ordini per comune ed esiti dai rapportini',
    icon: <Waves {...ICON} />,
  },
  misuratori: {
    titolo: 'Misuratori',
    href: '/hub/misuratori',
    desc: 'Registro dei misuratori rimossi',
    icon: <Gauge {...ICON} />,
  },
} as const;

/** Breadcrumb + titolo della vista, con le fogliette verso le altre viste del modulo. */
export function AceaNav({ attivo }: { attivo: Exclude<VistaAcea, 'hub'> }) {
  const corrente = VISTE_ACEA[attivo];
  const altre = (Object.keys(VISTE_ACEA) as Array<keyof typeof VISTE_ACEA>).filter((k) => k !== attivo);
  return (
    <div className="space-y-4">
      <div>
        <Breadcrumb items={[{ label: 'ACEA', href: '/hub/acea' }, { label: corrente.titolo }]} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">
          {corrente.titolo}
        </h1>
        <p className="mt-0.5 text-sm text-[var(--brand-text-muted)]">{corrente.desc}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {altre.map((k) => (
          <FogliettaCard
            key={k}
            href={VISTE_ACEA[k].href}
            title={VISTE_ACEA[k].titolo}
            description={VISTE_ACEA[k].desc}
            icon={VISTE_ACEA[k].icon}
          />
        ))}
      </div>
    </div>
  );
}
