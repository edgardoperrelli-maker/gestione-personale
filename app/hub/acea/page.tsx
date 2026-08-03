import { ClipboardCheck } from 'lucide-react';
import { gatePagina } from '@/lib/auth/gatePagina';
import AuthGate from '@/components/AuthGate';
import Breadcrumb from '@/components/ui/Breadcrumb';
import FogliettaCard from '@/components/ui/FogliettaCard';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { VISTE_ACEA } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';

export const dynamic = 'force-dynamic';

/**
 * Hub del modulo ACEA: i contatori di testa e le viste della commessa.
 *
 * È la testa di modulo, quindi `ObjectHeader` e non un titolo su misura (DESIGN.md §3). Le
 * FogliettaCard stanno QUI e solo qui: è la pagina in cui si sceglie dove andare, e ripeterle in
 * cima a ogni vista figlia rubava spazio alla tabella su ogni schermata.
 *
 * GATE (2026-08-03): questa pagina non ne aveva NESSUNO — si fidava del solo middleware.
 * Non era un buco (il middleware sbarra `/hub/acea` e il modulo è `requiresAdminRole`), ma
 * era l'unica testa di modulo senza rete di sicurezza propria: bastava un domani un cambio
 * al `matcher` del middleware per scoprirla.
 *
 * Il controllo è `gatePagina`, che dentro chiama LA STESSA funzione del middleware: una sola
 * decisione, non due che si somigliano. Da qui l'assenza della query a `profiles` che le
 * pagine sorelle si portano dietro — con la precedenza ai metadata quel giro non può più
 * cambiare l'esito, e un roundtrip che non decide niente è solo latenza.
 */
export default async function AceaHubPage() {
  await gatePagina('/hub/acea');

  return (
    <AuthGate>
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'ACEA' }]} />
        <ObjectHeader
          title="Commessa ACEA"
          sub="Registro degli ordini dal Cruscotto, pianificazione e limitazioni massive."
        />

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
          {/* Fuori dalle fogliette di proposito: si guarda prima del cut-over, non ogni giorno. */}
          <FogliettaCard
            href="/hub/acea/collaudo"
            title="Collaudo"
            description="Confronto col Cruscotto e cancelli prima di spegnere il master"
            icon={<ClipboardCheck size={18} strokeWidth={1.75} />}
          />
        </div>
      </div>
    </AuthGate>
  );
}
