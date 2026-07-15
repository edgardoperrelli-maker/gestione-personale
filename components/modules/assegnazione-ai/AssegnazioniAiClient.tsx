'use client';

import { useAceaNav } from './useAceaNav';
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
}) {
  const { nav, vai, risali } = useAceaNav();
  const { commessa, attivita, azione } = nav;

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: 'var(--brand-text-main)' }}
        >
          Assegnazioni AI
        </h1>
        <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
          Operazioni ACEA per commessa e attività.
        </p>
      </header>

      {commessa && <Breadcrumb nav={nav} onNavigate={risali} />}

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
