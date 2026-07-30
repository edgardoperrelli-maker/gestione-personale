'use client';

import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';
import { ATTIVITA_TABELLONE, type Famiglia } from '@/lib/acea/famiglia';
import type { GiornoProgrammabile } from '@/lib/acea/giorniProgrammabili';

/**
 * La guida della tabella, in una modale aperta dal «?».
 *
 * Prima era un paragrafo fisso sotto la tabella: cresceva a ogni funzione nuova e si è mangiato
 * tre righe di registro — spazio pagato SEMPRE per un testo che serve le prime volte. La guida è
 * consultazione, non stato: si apre quando serve e la tabella si riprende la piega.
 */

type PropsGuida = {
  giorni: GiornoProgrammabile[];
  /** La famiglia della vista: la guida nomina l'attività di tabellone giusta (DUNNING / MASSIVE). */
  famiglia: Famiglia;
};

/** Contenuto della guida, esportato nudo: si prova con un render statico, senza stato né Dialog. */
export function ContenutoGuida({ giorni, famiglia }: PropsGuida) {
  const { etichetta: attivita } = ATTIVITA_TABELLONE[famiglia];
  const finestra = giorni.length > 0
    ? giorni.map((g) => g.esteso).join(' o ')
    : 'oggi o il giorno lavorativo successivo';
  return (
    <div className="space-y-4 text-sm text-[var(--brand-text-main)]">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Modifica in cella
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Si modificano <strong>Esecutore</strong>, <strong>Data pianificata</strong> e <strong>Note</strong>: clicca una cella, frecce per spostarti, <kbd>Shift</kbd>+frecce o shift-click per un intervallo.</li>
          <li><strong>Doppio click sulla Data</strong> (o <kbd>Invio</kbd>) apre il calendario; la data si scrive anche a mano.</li>
          <li><strong>Click su una cella Esecutore vuota</strong> apre l&apos;elenco di chi ha l&apos;attività {attivita} in cronoprogramma, di qualunque territorio — si sceglie da lì, niente testo libero. Doppio click per cambiare un nome già scritto.</li>
          <li>La <strong>nota</strong> scritta qui arriva all&apos;operatore dentro il rapportino.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Copia e incolla
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><kbd>Ctrl</kbd>+<kbd>C</kbd> e <kbd>Ctrl</kbd>+<kbd>V</kbd> funzionano anche da e verso Excel. <strong>Si copia da qualsiasi colonna</strong>, campi ACEA compresi.</li>
          <li>Nella copia il <strong>cursore di cella</strong> vince sulle righe spuntate; senza un cursore attivo, <kbd>Ctrl</kbd>+<kbd>C</kbd> porta via le righe spuntate intere («Copia righe» lo fa sempre).</li>
          <li>Con delle righe spuntate, <kbd>Ctrl</kbd>+<kbd>V</kbd> scrive su tutte: una data o un nome copiati si incollano su quaranta spunte in un colpo, senza passare da «Pianifica».</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Righe spuntate
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Si spunta col quadratino o <strong>cliccando la riga</strong> sulle prime colonne (ODL, Attività, Impianto, Matricola); shift-click per un intervallo.</li>
          <li><strong>Pianifica</strong> assegna operatore e giorno a tutte le spunte.</li>
          <li><strong>Sul rapportino</strong> carica le righe già pianificate dritte sul rapportino del loro esecutore, senza passare dagli Strumenti.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Quando si programma, e su chi
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          {famiglia === 'massive'
            ? <li>Si programma solo per <strong>{finestra}</strong>, venerdì e sabato compresi: la regola «solo attivazioni» di quei giorni riguarda il dunning, non le massive.</li>
            : <li>Si programma solo per <strong>{finestra}</strong>; il venerdì e il sabato passano solo le attivazioni.</li>}
          <li>I nomi assegnabili sono quelli con l&apos;attività {attivita} nel{' '}
            <a href="/dashboard" className="underline">cronoprogramma</a> di quel giorno.</li>
          <li>Una riga con <em>solo</em> esecutore o <em>solo</em> data resta un appunto (in corsivo): non genera rapportini finché la coppia non è completa.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Colonne
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Si <strong>trascinano</strong> per riordinarle e si <strong>tirano dal bordo</strong> per la larghezza (doppio click sul bordo per rimetterla com&apos;era).</li>
          <li>Dal menu «Colonne» si scelgono quelle visibili e si esporta la vista filtrata.</li>
          <li>Una riga <strong>rossastra</strong> è una <strong>revoca</strong> (REVO) aperta: verifica sul sistema ACEA se è davvero una revoca o se va trasformata in Riattivazione o Regolarizzazione — l&apos;attività scritta non le distingue.</li>
        </ul>
      </section>
    </div>
  );
}

export default function GuidaTabella({ giorni, famiglia }: PropsGuida) {
  const [aperta, setAperta] = useState(false);
  return (
    <>
      {/*
        Icona sola ma con nome accessibile: il «?» è la convenzione, l'etichetta è per chi non
        la vede. `title` per chi ci passa sopra col mouse e non l'ha mai aperto.
      */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAperta(true)}
        aria-label="Guida della tabella"
        title="Come si usa la tabella (modifica, copia/incolla, programmazione)"
      >
        <CircleHelp size={14} aria-hidden="true" />
      </Button>
      <Dialog open={aperta} onClose={() => setAperta(false)} title="Come si usa la tabella">
        <ContenutoGuida giorni={giorni} famiglia={famiglia} />
      </Dialog>
    </>
  );
}
