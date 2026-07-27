// Header delle viste del modulo ACEA — pattern «foglietta» (DESIGN.md §7bis):
// breadcrumb di rientro + titolo della vista corrente.
//
// Le FogliettaCard verso le viste gemelle NON stanno qui. §7bis le vuole sulla LANDING del modulo
// (`/hub/acea`), che è il posto in cui si sceglie dove andare; ripeterle in cima a ogni vista figlia
// costava ~120px sopra la tabella su ogni pagina, tutti i giorni, per una navigazione già raggiungibile
// in un click dal breadcrumb. Su Dunning erano una delle ragioni per cui bisognava scorrere la
// pagina per vedere la tabella che a sua volta scorreva.
import { Droplets, Gauge, Waves, Wrench } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';

export type VistaAcea = 'hub' | 'dunning' | 'massive' | 'misuratori' | 'strumenti';

const ICON = { size: 18, strokeWidth: 1.75 } as const;

export const VISTE_ACEA = {
  dunning: {
    titolo: 'Dunning',
    href: '/hub/acea/dunning',
    desc: 'Pianificazione degli interventi e scadenze',
    icon: <Droplets {...ICON} />,
  },
  massive: {
    titolo: 'Limitazioni massive',
    href: '/hub/acea/massive',
    desc: 'Stato degli ordini per comune ed esiti dai rapportini',
    icon: <Waves {...ICON} />,
  },
  strumenti: {
    titolo: 'Strumenti della commessa',
    href: '/hub/acea/strumenti',
    desc: 'Import, rapportini del giorno, export e saracinesche',
    icon: <Wrench {...ICON} />,
  },
  misuratori: {
    titolo: 'Misuratori',
    href: '/hub/misuratori',
    desc: 'Registro dei misuratori rimossi',
    icon: <Gauge {...ICON} />,
  },
} as const;

/** Breadcrumb di rientro + titolo della vista corrente. */
export function AceaNav({ attivo }: { attivo: Exclude<VistaAcea, 'hub'> }) {
  const corrente = VISTE_ACEA[attivo];
  return (
    <div>
      <Breadcrumb items={[{ label: 'ACEA', href: '/hub/acea' }, { label: corrente.titolo }]} />
      <h1 className="mt-1 text-xl font-semibold tracking-[-0.015em] text-[var(--brand-text-main)]">
        {corrente.titolo}
      </h1>
      <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">{corrente.desc}</p>
    </div>
  );
}
