// Header delle viste del modulo Lista attesa — pattern «foglietta» (DESIGN.md §7bis):
// breadcrumb + titolo della vista corrente, FogliettaCard verso la vista gemella.
// Route invariate; sostituisce le vecchie underline-tab.

import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';

const VISTE = {
  richieste: {
    titolo: 'Richieste manuali',
    href: '/hub/lista-attesa',
    desc: 'Coda delle richieste operatori da approvare',
  },
  registro: {
    titolo: 'Registro autorizzazioni',
    href: '/hub/lista-attesa/registro',
    desc: 'Storico delle richieste approvate e rifiutate',
  },
} as const;

export function ListaAttesaNav({ attivo }: { attivo: 'richieste' | 'registro' }) {
  const corrente = VISTE[attivo];
  const altra = VISTE[attivo === 'richieste' ? 'registro' : 'richieste'];
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Breadcrumb items={[{ label: 'Lista attesa' }, { label: corrente.titolo }]} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">
          {corrente.titolo}
        </h1>
      </div>
      <FogliettaCard
        href={altra.href}
        title={altra.titolo}
        description={altra.desc}
        className="w-full sm:w-auto sm:min-w-72"
      />
    </div>
  );
}
