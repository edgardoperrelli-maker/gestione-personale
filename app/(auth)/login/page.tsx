import { Suspense } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // no SSG/PPR

export default function Page() {
  noStore(); // forza runtime
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Suspense fallback={null}>
        <LoginClient />
      </Suspense>
    </main>
  );
}
