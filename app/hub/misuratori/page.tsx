import AuthGate from '@/components/AuthGate';
import MisuratoriClient from '@/components/modules/misuratori/MisuratoriClient';

export const dynamic = 'force-dynamic';

export default function MisuratoriPage() {
  return (
    <AuthGate>
      <MisuratoriClient />
    </AuthGate>
  );
}
