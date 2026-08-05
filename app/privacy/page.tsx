import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

// Pagina pubblica (fuori dal matcher del middleware): è l'URL "Informativa
// sulla privacy" richiesto dalle schede App Store / Play Store.
export const metadata: Metadata = {
  title: 'Informativa sulla privacy — Gestilab Plenzich',
  description: 'Informativa sul trattamento dei dati personali dell’app Gestilab Plenzich.',
};

const AGGIORNAMENTO = '5 agosto 2026';
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

        <h1 className="text-3xl font-semibold tracking-tight text-[var(--brand-text-main)]">
          Informativa sulla privacy
        </h1>
        <p className="mt-2 text-xs text-[var(--brand-text-subtle)]">Ultimo aggiornamento: {AGGIORNAMENTO}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--brand-text-muted)]">
          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">A chi si rivolge l&rsquo;app</h2>
            <p>
              Gestilab Plenzich è un&rsquo;applicazione aziendale riservata al personale autorizzato di
              Plenzich S.p.A. Serve a gestire le attività lavorative quotidiane: giri di lavoro,
              rapportini, esiti degli interventi e relative fotografie. Non è destinata al pubblico e
              non prevede registrazione autonoma: le credenziali vengono assegnate dall&rsquo;azienda.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Titolare del trattamento</h2>
            <p>
              Plenzich S.p.A. Per ogni richiesta relativa ai dati personali:{' '}
              <a className="text-[var(--brand-primary)] underline" href={`mailto:${CONTATTO}`}>{CONTATTO}</a>.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Dati trattati</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Credenziali di accesso: nome utente e password (conservata in forma cifrata).</li>
              <li>Dati identificativi dell&rsquo;operatore: nome e cognome, ruolo aziendale.</li>
              <li>Dati operativi: attività assegnate, rapportini, esiti, note di lavoro.</li>
              <li>Fotografie scattate o allegate per documentare gli interventi.</li>
              <li>Dati tecnici minimi necessari al funzionamento (log di accesso e di sicurezza).</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Dati che NON raccogliamo</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Posizione: l&rsquo;app non raccoglie né trasmette la posizione dell&rsquo;utente. La funzione
                &laquo;trova la mia posizione&raquo; della mappa resta interamente sul dispositivo.
              </li>
              <li>Nessuna pubblicità, nessuna profilazione, nessun tracciamento a fini di marketing.</li>
              <li>Nessuna cessione di dati a terzi per finalità commerciali.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Finalità e base giuridica</h2>
            <p>
              I dati sono trattati esclusivamente per la gestione operativa delle attività lavorative
              (assegnazione, esecuzione e rendicontazione degli interventi). La base giuridica è
              l&rsquo;esecuzione del rapporto di lavoro e il legittimo interesse organizzativo del datore di
              lavoro (art. 6 GDPR).
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Uso offline</h2>
            <p>
              Per consentire il lavoro senza connessione, una copia dei dati operativi e delle foto in
              attesa di invio viene salvata localmente sul dispositivo, all&rsquo;interno del contenitore
              riservato dell&rsquo;app. Questi dati si eliminano disinstallando l&rsquo;app.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Fornitori tecnici</h2>
            <p>
              L&rsquo;app si appoggia a fornitori cloud per l&rsquo;hosting (Vercel) e per il database e
              l&rsquo;archiviazione (Supabase), che trattano i dati per nostro conto con misure di sicurezza
              adeguate. L&rsquo;accesso ai dati è protetto da autenticazione e limitato al personale
              autorizzato.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Conservazione</h2>
            <p>
              I dati sono conservati per la durata del rapporto di lavoro e successivamente nei limiti
              previsti dagli obblighi di legge e dalla documentazione tecnica degli interventi.
            </p>
          </section>

          <section>
            <h2 className="mb-1 text-base font-semibold text-[var(--brand-text-main)]">Diritti dell&rsquo;interessato</h2>
            <p>
              In qualunque momento è possibile esercitare i diritti previsti dagli artt. 15&ndash;22 GDPR
              (accesso, rettifica, cancellazione, limitazione, opposizione) scrivendo a{' '}
              <a className="text-[var(--brand-primary)] underline" href={`mailto:${CONTATTO}`}>{CONTATTO}</a>.
              Resta salvo il diritto di reclamo al Garante per la protezione dei dati personali.
            </p>
          </section>
        </div>

        <p className="mt-10 text-xs text-[var(--brand-text-subtle)]">
          <Link className="underline" href="/supporto">Supporto</Link>
          {' · '}
          <Link className="underline" href="/login">Accedi</Link>
        </p>
      </div>
    </main>
  );
}
