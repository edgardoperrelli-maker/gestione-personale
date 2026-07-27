import { caricaCommittenti, caricaTerritoriMaster } from '@/lib/contratti/dati';
import CommesseClient from './CommesseClient';

export const dynamic = 'force-dynamic';

export default async function CommessePage() {
  const [committenti, territories] = await Promise.all([caricaCommittenti(), caricaTerritoriMaster()]);
  return (
    <CommesseClient
      initial={committenti}
      territories={territories}
      oggi={new Date().toISOString().slice(0, 10)}
    />
  );
}
