import { AceaNav } from '@/components/modules/acea/AceaNav';
import DunningClient from '@/components/modules/acea/DunningClient';

export const dynamic = 'force-dynamic';

/**
 * Dunning: pianificazione degli interventi e scadenze.
 *
 * Import, rapportini, export e saracinesche stanno in `/hub/acea/strumenti`: qui resta la sola
 * tabella, così la pianificazione occupa lo schermo invece di stare in mezzo a una colonna alta
 * due schermate.
 */
export default function AceaDunningPage() {
  return (
    <div className="space-y-3">
      <AceaNav attivo="dunning" />
      <DunningClient />
    </div>
  );
}
