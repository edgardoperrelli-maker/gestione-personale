import { AceaNav } from '@/components/modules/acea/AceaNav';
import DunningClient from '@/components/modules/acea/DunningClient';

export const dynamic = 'force-dynamic';

/** Dunning: import dell'export ACEA e pianificazione degli interventi. */
export default function AceaDunningPage() {
  return (
    <div className="space-y-6">
      <AceaNav attivo="dunning" />
      <DunningClient />
    </div>
  );
}
