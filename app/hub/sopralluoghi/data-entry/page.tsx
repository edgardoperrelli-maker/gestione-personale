import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DataEntryPage() {
  redirect('/hub/sopralluoghi/risanamento?tab=registrazione');
}
