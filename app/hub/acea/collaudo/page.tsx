import Breadcrumb from '@/components/ui/Breadcrumb';
import CollaudoClient from '@/components/modules/acea/CollaudoClient';

export const dynamic = 'force-dynamic';

/**
 * Collaudo e cut-over.
 *
 * Non è una vista di lavoro quotidiano — per questo sta fuori dalle fogliette — ma il pannello che
 * si guarda prima di spegnere il master, e a cui si torna se qualcosa non torna.
 */
export default function AceaCollaudoPage() {
  return (
    <div className="space-y-4">
      {/* Stessa scala delle altre viste ACEA (`AceaNav`): era l'unica pagina del modulo a `text-2xl`
          con un'altra crenatura, e affiancata alle sorelle si notava. */}
      <div>
        <Breadcrumb items={[{ label: 'ACEA', href: '/hub/acea' }, { label: 'Collaudo' }]} />
        <h1 className="mt-1 text-xl font-semibold tracking-[-0.015em] text-[var(--brand-text-main)]">
          Collaudo e cut-over
        </h1>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          La prova che il modulo dice le stesse cose del Cruscotto, prima di spegnere il master.
        </p>
      </div>
      <CollaudoClient />
    </div>
  );
}
