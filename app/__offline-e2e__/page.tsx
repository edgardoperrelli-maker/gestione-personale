import { notFound } from 'next/navigation';
import HarnessClient from './HarnessClient';

export const dynamic = 'force-dynamic';

/** Pagina di test e2e per il data layer offline. Disponibile SOLO fuori produzione. */
export default function OfflineE2EPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <HarnessClient />;
}
