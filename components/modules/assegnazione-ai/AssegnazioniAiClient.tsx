'use client';

/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md
 * designed-as-app · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Hub drill-down (Commessa→Attività→Azione) + banco di lavoro per operatore. Il
 * modulo nasceva prima del sistema Cockpit: il redesign ha portato glifi Unicode
 * → icone lucide, la modale territorio e l'annuncio → primitivo Dialog, il
 * breadcrumb a mano → primitivo condiviso, i #fff cablati → --on-danger, i raggi
 * in scala e i numeri in mono tabulare. IA e logica invariate; niente API/driver.
 */

import { useAceaNav } from './useAceaNav';
import { AvvisiSyncBanner } from '@/components/modules/agente/AvvisiSyncBanner';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { Breadcrumb } from './Breadcrumb';
import { CommessaGrid } from './CommessaGrid';
import { AttivitaGrid } from './AttivitaGrid';
import { AzioneGrid } from './AzioneGrid';
import { Foglia } from './foglie/Foglia';
import type { RigaPianificabile, FileConfig } from './tipi';
import type { AgenteRunRow } from '@/lib/agente/uiTypes';
import type { FileMaster } from '@/lib/agente/comuni';

export default function AssegnazioniAiClient(props: {
  righe: RigaPianificabile[];
  fileConfig: FileConfig[];
  pianificaData: string | null;
  runs: AgenteRunRow[];
  filesMaster: FileMaster[];
  online: { minutiDaContatto: number | null; ultimoContatto: string | null };
  avvisiSync: string[];
  avvisiSyncIl: string | null;
}) {
  const { nav, vai } = useAceaNav();
  const { commessa, attivita, azione } = nav;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <ObjectHeader title="Assegnazioni AI" sub="Operazioni ACEA per commessa e attività." />

      <AvvisiSyncBanner avvisi={props.avvisiSync} rilevatoIl={props.avvisiSyncIl} />

      {commessa && <Breadcrumb nav={nav} />}

      {!commessa && (
        <CommessaGrid onSelect={(c) => vai({ commessa: c, attivita: null, azione: null })} />
      )}
      {commessa && !attivita && (
        <AttivitaGrid commessa={commessa} onSelect={(a) => vai({ attivita: a, azione: null })} />
      )}
      {commessa && attivita && !azione && (
        <AzioneGrid
          commessa={commessa}
          attivita={attivita}
          onSelect={(az) => vai({ azione: az })}
        />
      )}
      {commessa && attivita && azione && <Foglia nav={nav} {...props} />}
    </main>
  );
}
