'use client';

import { useRouter } from 'next/navigation';
import { CalendarX2, Check, MessageSquareText, RefreshCw, UserX, WifiOff } from 'lucide-react';
import Button from '@/components/Button';
import ObjectHeader from '@/components/ui/ObjectHeader';
import { useStatoSync } from '@/lib/offline/useStatoSync';

export type NotaOggi = {
  /** Contesto della nota (via, o in mancanza nominativo/ODL). */
  riferimento: string | null;
  testo: string;
};

export type GiroOggi = {
  token: string;
  stato: 'valido' | 'inviato' | 'scaduto';
  totale: number;
  completate: number;
  daFare: number;
  odlTop: number;
  note: NotaOggi[];
};

/** Card del modulo: stessa superficie delle card di sistema (ObjectHeader/KpiCard). */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function TitoloCard({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">{children}</h2>;
}

/** Statistica del giro: numero mono tabulare + etichetta muted. */
function Stat({ valore, etichetta }: { valore: number; etichetta: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-2xl font-semibold leading-none tracking-[-0.02em] text-[var(--brand-text-main)] tabular-nums">
        {valore}
      </div>
      <div className="mt-1 text-xs text-[var(--brand-text-muted)]">{etichetta}</div>
    </div>
  );
}

/**
 * Stato della coda offline, dallo stesso hook del portale operatore (`useStatoSync`).
 * Componente separato perché il hook esiste solo quando esiste un token.
 */
function CardSincronizzazione({ token }: { token: string }) {
  const { inAttesa, bloccati, online } = useStatoSync(token);
  const pendenti = inAttesa + bloccati;

  let testo: React.ReactNode;
  let colori: React.CSSProperties;
  let Icona: typeof Check;
  if (pendenti > 0) {
    testo = (
      <>
        <span className="font-mono tabular-nums">{pendenti}</span> in attesa
        {!online && ' · offline'}
      </>
    );
    colori = { backgroundColor: 'var(--warning-soft)', color: 'var(--warning)' };
    Icona = online ? RefreshCw : WifiOff;
  } else if (!online) {
    testo = 'Offline';
    colori = { backgroundColor: 'var(--brand-surface-muted)', color: 'var(--brand-text-muted)' };
    Icona = WifiOff;
  } else {
    testo = 'Tutto sincronizzato';
    colori = { backgroundColor: 'var(--success-soft)', color: 'var(--success)' };
    Icona = Check;
  }

  return (
    <Card>
      <TitoloCard>Sincronizzazione</TitoloCard>
      <p className="mt-3" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={colori}>
          <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          {testo}
        </span>
      </p>
      <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
        {pendenti > 0
          ? 'I dati salvati sul telefono verranno inviati appena possibile.'
          : 'Il lavoro salvato dal rapportino è al sicuro.'}
      </p>
    </Card>
  );
}

/** Stato vuoto a card intera: icona lucide + titolo + spiegazione. */
function StatoVuoto({
  Icona,
  titolo,
  messaggio,
}: {
  Icona: typeof CalendarX2;
  titolo: string;
  messaggio: string;
}) {
  return (
    <Card className="py-10 text-center sm:py-12">
      <div
        className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-surface-muted)] text-[var(--brand-text-muted)]"
        aria-hidden
      >
        <Icona className="h-6 w-6" strokeWidth={1.6} />
      </div>
      <h2 className="text-lg font-semibold text-[var(--brand-text-main)]">{titolo}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--brand-text-muted)]">{messaggio}</p>
    </Card>
  );
}

/**
 * «Il mio giorno» — home dell'operatore (design hallmark in-sistema 2026-08-04):
 * testata, card «Giro di oggi» con avanzamento e CTA verso /r/<token>, note
 * dell'ufficio solo se presenti, stato della coda offline. Mobile-first una
 * colonna; da ≥768px le card secondarie vanno su due colonne.
 */
export default function OggiClient({
  dataEstesa,
  operatore,
  senzaStaff,
  giro,
}: {
  dataEstesa: string;
  operatore: string | null;
  senzaStaff: boolean;
  giro: GiroOggi | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <ObjectHeader
        title="Il mio giorno"
        sub={
          <>
            {dataEstesa}
            {operatore && <> · {operatore}</>}
          </>
        }
      />

      {senzaStaff ? (
        <StatoVuoto
          Icona={UserX}
          titolo="Utenza non collegata a un operatore"
          messaggio="Questa utenza non è associata a nessun operatore. Chiedi all'ufficio di collegarla dalla scheda del personale."
        />
      ) : !giro ? (
        <StatoVuoto
          Icona={CalendarX2}
          titolo="Nessun lavoro assegnato oggi"
          messaggio="Quando l'ufficio ti assegna un giro lo troverai qui."
        />
      ) : (
        <>
          {/* Card principale: il giro di oggi, a tutta larghezza. */}
          <Card>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TitoloCard>Giro di oggi</TitoloCard>
              {giro.odlTop > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-3 py-1 text-xs font-semibold text-[var(--warning)]"
                  title="Segnalati da ACEA come prioritari"
                >
                  <span className="font-mono tabular-nums">{giro.odlTop}</span>
                  {giro.odlTop === 1 ? ' da fare per primo' : ' da fare per primi'}
                </span>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
              <Stat valore={giro.totale} etichetta="interventi in totale" />
              <Stat valore={giro.completate} etichetta="completati" />
              <Stat valore={giro.daFare} etichetta="da fare" />
            </div>

            {/* Barra di avanzamento sottile: completati sul lavorabile (esclusi gli annullati). */}
            {(() => {
              const lavorabili = giro.completate + giro.daFare;
              const pct = lavorabili > 0 ? Math.min(100, Math.round((giro.completate / lavorabili) * 100)) : 0;
              return (
                <div
                  className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--brand-border)]"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Avanzamento del giro"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: 'var(--brand-primary)' }}
                  />
                </div>
              );
            })()}

            <div className="mt-5">
              {giro.stato === 'scaduto' ? (
                <p className="rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)] px-4 py-3 text-sm text-[var(--brand-text-muted)]">
                  Il collegamento al rapportino di oggi è scaduto. Contatta l&apos;ufficio per riceverne uno nuovo.
                </p>
              ) : (
                <Button
                  variant="primary"
                  size="touch"
                  className="w-full sm:w-auto"
                  onClick={() => router.push(`/r/${giro.token}`)}
                >
                  {giro.stato === 'inviato' ? 'Rivedi il rapportino' : 'Apri il rapportino'}
                </Button>
              )}
            </div>
          </Card>

          {/* Card secondarie: una colonna su mobile, due da ≥768px (minmax(0,1fr)). */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {giro.note.length > 0 && (
              <Card>
                <div className="flex items-center gap-2">
                  <MessageSquareText
                    className="h-4 w-4 shrink-0 text-[var(--brand-text-muted)]"
                    strokeWidth={1.6}
                    aria-hidden
                  />
                  <TitoloCard>Note dall&apos;ufficio</TitoloCard>
                </div>
                <ul className="mt-3 space-y-3">
                  {giro.note.map((n, i) => (
                    <li key={i} className="text-sm">
                      {n.riferimento && (
                        <div className="text-xs font-medium text-[var(--brand-text-muted)] [overflow-wrap:anywhere]">
                          {n.riferimento}
                        </div>
                      )}
                      <p className="mt-0.5 text-[var(--brand-text-main)] [overflow-wrap:anywhere]">{n.testo}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            <CardSincronizzazione token={giro.token} />
          </div>
        </>
      )}
    </div>
  );
}
