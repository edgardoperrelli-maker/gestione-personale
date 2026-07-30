'use client';

import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import Button from '@/components/Button';
import Dialog from '@/components/ui/Dialog';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { giornoEsteso } from '@/lib/acea/giorniProgrammabili';
import type { AnteprimaRapportino, GruppoRapportino, PianoCarico } from '@/lib/acea/caricaSuRapportino';
import type { EsitoOperatore, TipoEsito } from '@/lib/acea/vociRapportino';

/**
 * La modale dei rapportini: L'UNICA via dal registro ai rapportini del giorno.
 *
 * Prima le vie erano tre — il collegamento agli Strumenti (si perdeva la selezione navigando),
 * il bottone «Sul rapportino» in barra (conferme a catena, senza sapere prima cosa sarebbe
 * successo) e gli Strumenti stessi. Ora il gesto è uno: si selezionano le righe, si apre questa
 * modale, e PRIMA di premere si legge cosa succederà — per ogni (esecutore, giorno) l'anteprima
 * dice se si integra il rapportino esistente (con quante voci ha già a bordo, e se è consegnato
 * e andrà riaperto) o se ne nasce uno nuovo. La selezione resta dov'è: la modale si sovrappone,
 * non naviga.
 *
 * Il motore è quello di sempre (`/api/acea/rapportini`, `staffIds`+`data`): additivo e
 * idempotente, integra le voci nuove — che nel rapportino compaiono col badge «Nuovo» — e
 * interroga SOLO i rapportini delle coppie selezionate, mai tutta la giornata di tutti.
 */

type Props = {
  aperta: boolean;
  onChiudi: () => void;
  /** Le righe spuntate raggruppate per (esecutore, giorno): lo calcola il registro. */
  pianoCarico: PianoCarico;
  /** Righe spuntate in totale, per il riepilogo di testa. */
  selezionate: number;
  /** Dopo una generazione riuscita: ricarica la tabella (gli stati intervento si muovono). */
  onCaricato: () => void;
};

const chiaveGruppo = (g: GruppoRapportino) => `${g.staffId}|${g.data}`;

const ETICHETTA_ESITO: Record<TipoEsito, string> = {
  creato: 'rapportino creato',
  aggiunto: 'voci aggiunte al rapportino',
  richiede_riapertura: 'lasciato consegnato: non riaperto',
  nessuna_modifica: 'era già tutto a bordo',
};

export default function ModaleRapportini({
  aperta, onChiudi, pianoCarico, selezionate, onCaricato,
}: Props) {
  const { gruppi, nonPronte } = pianoCarico;

  /** Anteprima per coppia (`staffId|data`). `null` = non ancora arrivata (o non arrivabile). */
  const [anteprime, setAnteprime] = useState<Map<string, AnteprimaRapportino> | null>(null);
  /** Esito per coppia, dopo la generazione: sostituisce l'anteprima sulla stessa riga. */
  const [esiti, setEsiti] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState(false);

  /*
    L'anteprima parte all'apertura, mirata alle coppie della selezione. Best-effort: se fallisce
    la modale funziona lo stesso, solo senza la colonna «cosa succederà» — l'anteprima è una
    lettura di cortesia, il verdetto vero lo dà il motore.
  */
  useEffect(() => {
    if (!aperta) { setAnteprime(null); setEsiti(new Map()); setFatto(false); return; }
    if (gruppi.length === 0) return;
    let vivo = true;
    void (async () => {
      try {
        const p = new URLSearchParams();
        for (const g of gruppi) p.append('coppia', `${g.staffId}|${g.data}`);
        const res = await fetch(`/api/acea/rapportini?${p.toString()}`);
        if (!res.ok || !vivo) return;
        const body = (await res.json()) as { anteprime?: AnteprimaRapportino[] };
        setAnteprime(new Map((body.anteprime ?? []).map((a) => [`${a.staffId}|${a.data}`, a])));
      } catch {
        /* senza anteprima si genera lo stesso */
      }
    })();
    return () => { vivo = false; };
  }, [aperta, gruppi]);

  const genera = async () => {
    setBusy(true);
    const nuovi = new Map(esiti);
    try {
      for (const g of gruppi) {
        const chiave = chiaveGruppo(g);
        const chiama = (extra: Record<string, boolean>) => fetch('/api/acea/rapportini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: g.data, staffIds: [g.staffId], ...extra }),
        });
        let res = await chiama({});
        let body = (await res.json()) as {
          esiti?: EsitoOperatore[]; error?: string; incomplete?: string[];
        };
        // Righe a metà su quel giorno: il cancello del motore. Si chiede, riga per riga.
        if (res.status === 409 && body.incomplete) {
          const n = body.incomplete.length;
          const procedi = await chiediConferma({
            title: `${n} ${n === 1 ? 'ordine è programmato' : 'ordini sono programmati'} per ${giornoEsteso(g.data)} senza esecutore`,
            message: 'Non entreranno in nessun rapportino finché non hanno anche l\'esecutore. Generare lo stesso senza di loro?',
            confirmLabel: 'Genera senza di loro',
          });
          if (!procedi) { nuovi.set(chiave, 'saltato: righe a metà sul giorno'); setEsiti(new Map(nuovi)); continue; }
          res = await chiama({ confermaIncomplete: true });
          body = (await res.json()) as typeof body;
        }
        if (!res.ok) {
          nuovi.set(chiave, body.error ?? 'generazione non riuscita');
          setEsiti(new Map(nuovi));
          continue;
        }
        let esito = (body.esiti ?? []).find((e) => e.staff_id === g.staffId);
        if (esito?.esito === 'richiede_riapertura') {
          const riapri = await chiediConferma({
            title: `${g.nome} ha già consegnato il rapportino di ${giornoEsteso(g.data)}`,
            message: 'Riaprirlo per 48 ore e aggiungere gli interventi? Quanto già compilato resta com\'è.',
            confirmLabel: 'Riapri e aggiungi',
          });
          if (riapri) {
            res = await chiama({ confermaIncomplete: true, confermaRiaperture: true });
            body = (await res.json()) as typeof body;
            if (!res.ok) {
              nuovi.set(chiave, body.error ?? 'riapertura non riuscita');
              setEsiti(new Map(nuovi));
              continue;
            }
            esito = (body.esiti ?? []).find((e) => e.staff_id === g.staffId);
          }
        }
        nuovi.set(
          chiave,
          esito
            ? `${ETICHETTA_ESITO[esito.esito]}${esito.voci_aggiunte > 0 ? ` (+${esito.voci_aggiunte})` : ''}`
            : 'nessun intervento da caricare',
        );
        setEsiti(new Map(nuovi));
      }
      setFatto(true);
      onCaricato();
    } finally {
      setBusy(false);
    }
  };

  /** La riga di destino di un gruppo: l'ESITO quando c'è, altrimenti l'anteprima. */
  const destino = (g: GruppoRapportino): { testo: string; tono: 'ok' | 'warn' | 'muto' } => {
    const esito = esiti.get(chiaveGruppo(g));
    if (esito) return { testo: esito, tono: esito.includes('non ') || esito.startsWith('saltato') ? 'warn' : 'ok' };
    if (!anteprime) return { testo: '…', tono: 'muto' };
    const a = anteprime.get(chiaveGruppo(g));
    if (!a) return { testo: '…', tono: 'muto' };
    if (!a.esiste) return { testo: 'rapportino nuovo', tono: 'muto' };
    if (a.stato === 'inviato') return { testo: `già consegnato (${a.voci} voci): verrà chiesto di riaprirlo`, tono: 'warn' };
    return { testo: `si integra nel rapportino esistente (${a.voci} voci a bordo)`, tono: 'muto' };
  };

  const TONO: Record<'ok' | 'warn' | 'muto', string> = {
    ok: 'text-[var(--status-ok)]',
    warn: 'text-[var(--status-warn)]',
    muto: 'text-[var(--brand-text-muted)]',
  };

  return (
    <Dialog
      open={aperta}
      onClose={onChiudi}
      title="Rapportini"
      busy={busy}
      footer={
        fatto
          ? <Button variant="primary" size="sm" onClick={onChiudi}>Chiudi</Button>
          : (
            <>
              <Button variant="ghost" size="sm" onClick={onChiudi} disabled={busy}>Annulla</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void genera()}
                loading={busy}
                disabled={gruppi.length === 0}
              >
                <ClipboardList size={14} aria-hidden="true" />
                Genera
              </Button>
            </>
          )
      }
    >
      {gruppi.length === 0 ? (
        <div className="space-y-2 text-sm text-[var(--brand-text-main)]">
          <p>
            Nessuna riga selezionata pronta: spunta le righe con <strong>esecutore e data</strong>{' '}
            e riapri da qui — la selezione non si perde, la modale si sovrappone alla tabella.
          </p>
          {nonPronte > 0 && (
            <p className="text-xs text-[var(--status-warn)]">
              {nonPronte} {nonPronte === 1 ? 'riga spuntata non è pianificata' : 'righe spuntate non sono pianificate'}:
              completa esecutore e data.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brand-text-main)]">
            <span className="font-mono font-semibold tabular-nums">{selezionate}</span>
            {selezionate === 1 ? ' intervento selezionato' : ' interventi selezionati'} su{' '}
            <span className="font-mono font-semibold tabular-nums">{gruppi.length}</span>
            {gruppi.length === 1 ? ' rapportino' : ' rapportini'}:
          </p>

          <ul className="divide-y divide-[var(--brand-border)] rounded-[var(--radius-md)] border border-[var(--brand-border)]">
            {gruppi.map((g) => {
              const d = destino(g);
              return (
                <li key={chiaveGruppo(g)} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-[var(--brand-text-main)]">
                    <strong>{g.nome}</strong> — {giornoEsteso(g.data)}
                    <span className="text-[var(--brand-text-muted)]">
                      {' '}· {g.righe} {g.righe === 1 ? 'intervento' : 'interventi'}
                    </span>
                  </span>
                  <span className={`text-right text-xs ${TONO[d.tono]}`}>{d.testo}</span>
                </li>
              );
            })}
          </ul>

          {nonPronte > 0 && (
            <p className="text-xs text-[var(--status-warn)]">
              {nonPronte} {nonPronte === 1 ? 'riga spuntata resta fuori' : 'righe spuntate restano fuori'}:
              senza esecutore e data non c&apos;è nessun rapportino su cui caricarle.
            </p>
          )}

          <p className="text-xs text-[var(--brand-text-muted)]">
            Ogni rapportino riceve <strong>tutti</strong> gli interventi ACEA del suo operatore in
            quel giorno; le voci nuove arrivano col badge «Nuovo», e rigenerare non duplica niente.
          </p>
        </div>
      )}
    </Dialog>
  );
}
