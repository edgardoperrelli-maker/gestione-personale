import { AceaNav } from '@/components/modules/acea/AceaNav';
import StrumentiClient from '@/components/modules/acea/StrumentiClient';

export const dynamic = 'force-dynamic';

/**
 * Strumenti della commessa: import dell'export ACEA, rapportini del giorno, export e saracinesche.
 *
 * Foglietta a sé (DESIGN.md §7bis) perché è un contesto diverso dalla pianificazione: si apre a
 * inizio e a fine giornata, non mentre si assegna. Tenendoli in fondo alle viste-tabella si
 * scorreva oltre la tabella per raggiungerli, ed erano duplicati fra Dunning e Massive.
 */
export default function AceaStrumentiPage() {
  return (
    <div className="space-y-4">
      <AceaNav attivo="strumenti" />
      <StrumentiClient />
    </div>
  );
}
