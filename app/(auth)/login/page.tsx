import { Suspense } from 'react';
import Image from 'next/image';
import { unstable_noStore as noStore } from 'next/cache';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // no SSG/PPR

export default function Page() {
  noStore(); // forza runtime
  return (
    <main className="min-h-screen bg-[var(--brand-bg)] px-6 py-10">
      <div className="mx-auto flex min-h-[80vh] w-full max-w-5xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-white shadow-[var(--shadow-sm)]">
                <Image src="/brand/mark.svg" alt="" width={30} height={30} />
              </span>
              <span className="text-sm font-bold tracking-[0.14em] text-[var(--brand-text-main)]">
                PLENZICH S.p.A.
              </span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--brand-text-main)]">
              Gestione Personale
            </h1>
            <p className="max-w-md text-sm text-[var(--brand-text-muted)]">
              Pianifica turni, attività e reperibilità con una vista chiara e condivisa.
            </p>
            <p className="text-xs text-[var(--brand-text-subtle)]">Sviluppato con GestiLab</p>
          </div>
          <Suspense fallback={null}>
            <LoginClient />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
