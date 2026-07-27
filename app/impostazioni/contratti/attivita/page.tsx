import Link from 'next/link';
import { Workflow, TriangleAlert, ExternalLink } from 'lucide-react';
import Badge from '@/components/Badge';
import { caricaCommittenti, caricaAttivitaPerCodice } from '@/lib/contratti/dati';
import { committentiAttivi } from '@/lib/contratti/tipi';
import CardComprimibile from '@/components/ui/CardComprimibile';
import ContrattiNav from '../ContrattiNav';

export const dynamic = 'force-dynamic';

// Vista ATTIVITÀ del modulo Contratti (§7bis). SOLA LETTURA per scelta: le attività
// vivono in `attivita_tassonomia`, che ha già il suo modulo. Qui si vedono accanto al
// contratto insieme al flusso operatore che le copre — è la vista che fa saltare
// all'occhio l'attività a listino che nessun flusso sa compilare.
// Nessuno stato client: resta un server component.

export default async function AttivitaContrattoPage() {
  const [committenti, attivitaPerCodice] = await Promise.all([
    caricaCommittenti(),
    caricaAttivitaPerCodice(),
  ]);

  const righe = committentiAttivi(committenti).map((c) => ({
    committente: c,
    attivita: c.codice ? (attivitaPerCodice[c.codice] ?? []) : [],
  }));
  const senzaFlusso = righe.flatMap((r) => r.attivita).filter((a) => !a.flusso).length;

  return (
    <div className="space-y-4">
      <ContrattiNav
        attiva="attivita"
        azioni={
          <Link
            href="/impostazioni/azioni-operatori"
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-xs font-medium text-[var(--primary-text)] transition-colors hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            Configura le azioni
            <ExternalLink size={12} aria-hidden />
          </Link>
        }
      />

      {senzaFlusso > 0 && (
        <p className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--status-warn)]/40 bg-[var(--status-warn-soft)] px-4 py-2.5 text-sm text-[var(--brand-text-main)]">
          <TriangleAlert size={16} aria-hidden className="shrink-0 text-[var(--status-warn)]" />
          {senzaFlusso === 1 ? "Un'attività non ha" : `${senzaFlusso} attività non hanno`} un flusso di
          azioni: gli operatori non saprebbero cosa compilare.
        </p>
      )}

      {righe.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--brand-border)] px-6 py-12 text-center text-sm text-[var(--brand-text-muted)]">
          Nessun committente attivo.
        </div>
      ) : (
        <div className="space-y-3">
          {righe.map(({ committente: c, attivita }) => (
            <CardComprimibile
              key={c.id}
              etichetta={`Attività di ${c.nome}`}
              scorrevole="26rem"
              intestazione={
                <>
                  <span className="truncate text-sm font-semibold text-[var(--brand-text-main)]">{c.nome}</span>
                  {c.codice && (
                    <span className="font-mono text-xs text-[var(--brand-text-muted)]">{c.codice}</span>
                  )}
                  {attivita.some((a) => !a.flusso) && (
                    <Badge variant="warn">
                      {attivita.filter((a) => !a.flusso).length} senza flusso
                    </Badge>
                  )}
                  <span className="ml-auto font-mono text-xs tabular-nums text-[var(--brand-text-muted)]">
                    {attivita.length} {attivita.length === 1 ? 'gruppo' : 'gruppi'}
                  </span>
                </>
              }
            >
              {attivita.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--brand-text-muted)]">
                  {c.codice
                    ? 'Nessuna attività censita in tassonomia per questo committente.'
                    : 'Committente senza codice di runtime: non ha ancora lavorazioni a sistema.'}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--brand-border)]">
                  {attivita.map((a) => (
                    <li key={a.gruppo} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--brand-text-main)]">{a.gruppo}</span>
                        {a.flusso ? (
                          <Badge variant="ok">
                            <Workflow size={11} aria-hidden className="mr-1 inline" />
                            {a.flusso}
                          </Badge>
                        ) : (
                          <Badge variant="warn">Nessun flusso</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--brand-text-muted)]">{a.descrizioni.join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardComprimibile>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--brand-text-subtle)]">
        Le attività si gestiscono in{' '}
        <Link href="/impostazioni/attivita-tassonomia" className="text-[var(--primary-text)] hover:underline">
          Tassonomia attività
        </Link>
        : qui si vedono accanto al contratto per non perderne nessuna.
      </p>
    </div>
  );
}
