import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import Breadcrumb from '@/components/ui/Breadcrumb';
import ObjectHeader from '@/components/ui/ObjectHeader';
import FogliettaCard from '@/components/ui/FogliettaCard';
import { caricaCommittenti, caricaListino, caricaAttivitaPerCodice, contaSenzaFlusso } from '@/lib/contratti/dati';
import { committentiAttivi, contrattiAttivi, statoContratto } from '@/lib/contratti/tipi';
import { VISTE, ORDINE_VISTE } from './viste';

export const dynamic = 'force-dynamic';

// Landing del modulo Contratti — §7bis: le tre viste sono CONTESTI diversi
// (anagrafica / economico / operativo), quindi fogliette con route dedicata e non
// tre sezioni impilate in una pagina che scorre all'infinito.

export default async function ContrattiPage() {
  const [committenti, listino, attivitaPerCodice] = await Promise.all([
    caricaCommittenti(),
    caricaListino(),
    caricaAttivitaPerCodice(),
  ]);

  const oggi = new Date().toISOString().slice(0, 10);
  const attivi = committentiAttivi(committenti);
  const contratti = attivi.flatMap((c) => contrattiAttivi(c));
  const inCorso = contratti.filter((k) => statoContratto(k, oggi) === 'in-corso').length;
  const senzaFlusso = contaSenzaFlusso(attivitaPerCodice);
  const attivitaTotali = Object.values(attivitaPerCodice).flat().length;

  const conteggio: Record<string, number> = {
    commesse: contratti.length,
    prezzi: listino.length,
    attivita: attivitaTotali,
  };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'Impostazioni', href: '/impostazioni' }, { label: 'Contratti' }]} />

      <ObjectHeader
        title="Contratti"
        sub={
          contratti.length === 0
            ? 'Nessuna commessa aperta.'
            : `${contratti.length} ${contratti.length === 1 ? 'contratto' : 'contratti'} · ${inCorso} in corso`
        }
      />

      {senzaFlusso > 0 && (
        <Link
          href={VISTE.attivita.href}
          className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--status-warn)]/40 bg-[var(--status-warn-soft)] px-4 py-3 text-sm text-[var(--brand-text-main)] transition hover:border-[var(--status-warn)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          <TriangleAlert size={16} aria-hidden className="shrink-0 text-[var(--status-warn)]" />
          <span>
            {senzaFlusso === 1
              ? "Un'attività a contratto non ha un flusso di azioni"
              : `${senzaFlusso} attività a contratto non hanno un flusso di azioni`}
            : gli operatori non saprebbero cosa compilare.
          </span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDINE_VISTE.map((v) => (
          <FogliettaCard
            key={v}
            href={VISTE[v].href}
            title={VISTE[v].titolo}
            description={VISTE[v].desc}
            count={conteggio[v]}
          />
        ))}
      </div>
    </div>
  );
}
