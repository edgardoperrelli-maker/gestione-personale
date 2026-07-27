import { AceaNav } from '@/components/modules/acea/AceaNav';
import ContatoriAcea from '@/components/modules/acea/ContatoriAcea';

export const dynamic = 'force-dynamic';

/**
 * Limitazioni massive: il master come lo si vede oggi, senza il file.
 *
 * La tabella (unica, con filtro comune) arriva con la parte 5 del piano. L'import è condiviso e
 * sta nella vista Dunning: un solo file alimenta entrambe le famiglie.
 */
export default function AceaMassivePage() {
  return (
    <div className="space-y-6">
      <AceaNav attivo="massive" />
      <ContatoriAcea />
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4">
        <p className="text-sm text-[var(--brand-text-main)]">
          La tabella degli ordini massivi per comune è in arrivo.
        </p>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          Mostrerà, per ogni ordine: stato ACEA, esecutore, data, esito, sigillo e saracinesca dai
          rapportini, più le righe aggiunte manualmente dagli operatori. L&apos;export si carica
          dalla vista Dunning: un solo file aggiorna entrambe le famiglie.
        </p>
      </div>
    </div>
  );
}
