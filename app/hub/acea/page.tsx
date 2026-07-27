import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';
import { VISTE_ACEA } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';

export const dynamic = 'force-dynamic';

/** Hub del modulo ACEA: le tre viste della commessa più i contatori di testa. */
export default function AceaHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: 'ACEA' }]} />
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--brand-text-main)]">
          Commessa ACEA
        </h1>
        <p className="mt-0.5 text-sm text-[var(--brand-text-muted)]">
          Registro degli ordini dal Cruscotto, pianificazione e limitazioni massive.
        </p>
      </div>

      <ContatoriAcea />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(VISTE_ACEA) as Array<keyof typeof VISTE_ACEA>).map((k) => (
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
