'use client';

import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';
import { ATTIVITA_TABELLONE, type Famiglia } from '@/lib/acea/famiglia';
import { spiegaFinestra } from '@/lib/acea/giorniProgrammabili';

/**
 * La guida della tabella, in una modale aperta dal «?».
 *
 * Prima era un paragrafo fisso sotto la tabella: cresceva a ogni funzione nuova e si è mangiato
 * tre righe di registro — spazio pagato SEMPRE per un testo che serve le prime volte. La guida è
 * consultazione, non stato: si apre quando serve e la tabella si riprende la piega.
 */

type PropsGuida = {
  /** «Oggi» secondo il server: la guida ne ricava la finestra vera, con le sue date. */
  oggi: string;
  /** La famiglia della vista: la guida nomina l'attività di tabellone giusta (DUNNING / MASSIVE). */
  famiglia: Famiglia;
  /**
   * `true` per gli Admin Plus, che scrivono anche l'anagrafica del punto.
   *
   * La riga compare solo a chi quel gesto ce l'ha: spiegarlo a chi non può farlo sarebbe
   * descrivere un comando che non c'è, e la guida diventerebbe un elenco di cose da chiedere.
   */
  anagraficaModificabile?: boolean;
};

/** Contenuto della guida, esportato nudo: si prova con un render statico, senza stato né Dialog. */
export function ContenutoGuida({ oggi, famiglia, anagraficaModificabile = false }: PropsGuida) {
  const { etichetta: attivita } = ATTIVITA_TABELLONE[famiglia];
  // Senza «oggi» (il server non ha ancora risposto) la frase resta vera ma senza date: meglio
  // generica che sbagliata, e sbagliata sarebbe se la calcolassimo sull'orologio del browser.
  const finestra = spiegaFinestra(oggi).replace(/^si programma /, '');
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
          {anagraficaModificabile && (
            <li>
              Come <strong>Admin Plus</strong> si corregge anche l&apos;<strong>anagrafica del
              punto</strong> — indirizzo, comune, CAP, {famiglia === 'acqualatina' ? 'cod. fornitura' : 'impianto'},
              nome utente, recapito: doppio click sulla cella. La correzione scende
              sull&apos;intervento e sulla voce di rapportino, anche se è già in mano
              all&apos;operatore. <strong>ODL e matricola no</strong>: sono la chiave e
              l&apos;identità della riga, una matricola diversa non è una correzione ma un altro
              punto.{' '}
              {famiglia === 'acqualatina'
                ? 'Attenzione: il prossimo master del committente rimette il suo valore se è diverso.'
                : 'Attenzione: il prossimo import dell’export ACEA rimette il suo valore se è diverso.'}
            </li>
          )}
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Copia e incolla
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><kbd>Ctrl</kbd>+<kbd>C</kbd> e <kbd>Ctrl</kbd>+<kbd>V</kbd> funzionano anche da e verso Excel. <strong>Si copia da qualsiasi colonna</strong>, campi ACEA compresi.</li>
          <li>L&apos;<strong>ODL nudo</strong> si copia con l&apos;icona che compare passando sulla cella (il click sulla cella ormai spunta la riga); da tastiera: frecce + <kbd>Ctrl</kbd>+<kbd>C</kbd>.</li>
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
          <li><strong>Rapportini</strong> (comando in alto) apre la modale di carico sulla selezione: per ogni esecutore dice prima se <em>si integra</em> il rapportino esistente — le voci nuove arrivano col badge «Nuovo» — o se ne <em>nasce uno</em>. La selezione resta: non si naviga.</li>
        </ul>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          Quando si programma, e su chi
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          {famiglia === 'dunning'
            ? <li>Si programma <strong>{finestra}</strong>; il venerdì e il sabato passano solo le attivazioni.</li>
            : <li>Si programma <strong>{finestra}</strong>, venerdì e sabato compresi: la regola «solo attivazioni» di quei giorni riguarda il dunning, non questa vista.</li>}
          <li>Il <strong>giorno</strong> si scrive o si sceglie dal calendario nella barra di assegnazione: dentro la finestra ci si può spostare liberamente, lunedì compreso.</li>
          <li>I nomi assegnabili sono quelli con l&apos;attività {attivita} nel{' '}
            <a href="/dashboard" className="rounded-[var(--radius-sm)] underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]">cronoprogramma</a> di quel giorno.</li>
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
          {famiglia !== 'acqualatina' && (
            <li>Una riga <strong>rossastra</strong> è una <strong>revoca</strong> (REVO) aperta: verifica sul sistema ACEA se è davvero una revoca o se va trasformata in Riattivazione o Regolarizzazione — l&apos;attività scritta non le distingue.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

export default function GuidaTabella({ oggi, famiglia, anagraficaModificabile }: PropsGuida) {
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
        {/*
          16 e non 14 come le icone che stanno ACCANTO a un testo: qui l'icona e` tutto il
          contenuto del bottone, e a 14 il comando rendeva 28px contro i 30 degli altri della
          riga — la differenza la fa il testo, che porta con se` un'interlinea di 16.
        */}
        <CircleHelp size={16} aria-hidden="true" />
      </Button>
      <Dialog open={aperta} onClose={() => setAperta(false)} title="Come si usa la tabella">
        <ContenutoGuida oggi={oggi} famiglia={famiglia} anagraficaModificabile={anagraficaModificabile} />
      </Dialog>
    </>
  );
}
