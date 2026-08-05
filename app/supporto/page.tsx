import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

// Pagina pubblica (fuori dal matcher del middleware): è l'URL "Supporto"
// richiesto dalle schede App Store / Play Store.
export const metadata: Metadata = {
  title: 'Supporto — Gestilab Plenzich',
  description: 'Assistenza per l’app Gestilab Plenzich, riservata al personale Plenzich S.p.A.',
};

const CONTATTO = 'edgardo.perrelli@gmail.com';

export default function Page() {
  return (
    <main className="min-h-screen bg-[var(--brand-bg)] px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-white shadow-[var(--shadow-sm)]">
            <Image src="/brand/mark.svg" alt="" width={30} height={30} />
          </span>
          <div>
            <p className="text-sm font-bold tracking-[0.14em] text-[var(--brand-text-main)]">PLENZICH S.p.A.</p>
            <p className="text-xs text-[var(--brand-text-subtle)]">Gestilab Plenzich</p>
          </div>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight text-[var(--brand-text-main)]">Supporto</h1>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--brand-text-muted)]">
          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">App riservata al personale</h2>
            <p>
              Gestilab Plenzich è l&rsquo;app aziendale del personale operativo di Plenzich S.p.A.
              Non è prevista la registrazione autonoma: le credenziali di accesso vengono assegnate
              dall&rsquo;ufficio. Se non hai ancora un&rsquo;utenza, rivolgiti al tuo referente.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Problemi di accesso</h2>
            <p>
              Password dimenticata o account bloccato: il reset viene eseguito dall&rsquo;ufficio, che ti
              consegna una nuova password temporanea da cambiare al primo accesso. Non esiste un
              modulo di recupero automatico.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Assistenza tecnica</h2>
            <p>
              Per malfunzionamenti, segnalazioni o richieste sull&rsquo;app scrivi a{' '}
              <a className="text-[var(--brand-primary)] underline" href={`mailto:${CONTATTO}`}>{CONTATTO}</a>,
              indicando il dispositivo utilizzato e una descrizione del problema.
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-[var(--brand-text-subtle)]">
          <Link className="underline" href="/privacy">Informativa sulla privacy</Link>
          {' · '}
          <Link className="underline" href="/login">Accedi</Link>
        </p>
      </div>
    </main>
  );
}
