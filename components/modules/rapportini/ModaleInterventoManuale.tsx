/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { SelettoreAttivitaTassonomia } from './SelettoreAttivitaTassonomia';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { TemplateInfoCampo } from '@/utils/rapportini/infoCampi';
import { CampoInput } from './CampoInput';
import { CampoFoto } from './CampoFoto';
import { anagraficaCampi } from '@/lib/interventi/manuali/anagraficaCampi';
import type { CommittenteManuale, AnagraficaManuale } from '@/lib/interventi/manuali/types';
import { campiFoto, validaFotoObbligatorie } from '@/lib/interventi/manuali/validaFotoObbligatorie';
import { haEsitoNegativo } from '@/utils/rapportini/voceColore';
import { campiObbligatoriMancanti } from '@/lib/interventi/manuali/campiObbligatoriMancanti';
import { seedRisposteDaAnagrafica } from '@/lib/interventi/manuali/seedRisposteDaAnagrafica';
import { esitoPositivoDefault } from '@/lib/interventi/manuali/esitoPositivoDefault';
import { attivitaDefaultManuale } from '@/lib/interventi/manuali/attivitaPerCommittente';
import { messaggioErroreManuale } from '@/lib/interventi/manuali/messaggioErroreManuale';
import { CercaMatricolaLimitazione } from './limitazione/CercaMatricolaLimitazione';
import { CercaMatricolaAcqualatina } from './acqualatina/CercaMatricolaAcqualatina';
import { autofillAnagrafica } from '@/lib/limitazione/autofillAnagrafica';
import type { VoceMatricola } from '@/lib/limitazione/matchVociMatricola';
import { accodaManuale } from '@/lib/offline/persistManuale';
import { sincronizzaToken } from '@/lib/offline/sync';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';
import type { TassonomiaRiga } from '@/lib/attivita/tassonomia';
import { opzioniAttivitaManuale } from '@/lib/interventi/manuali/opzioniAttivitaManuale';

const COMMITTENTI: { value: CommittenteManuale; label: string }[] = [
  { value: 'italgas', label: 'Italgas' },
  { value: 'lim_massive', label: 'Limitazioni massive' },
  { value: 'acqualatina', label: 'AcquaLatina' },
  { value: 'altro', label: 'Altro' },
];

export function ModaleInterventoManuale({
  token,
  infoCampi,
  campiPerCommittente,
  infoCampiPerCommittente = {},
  campiStandard,
  voci,
  onApriAssegnato,
  onClose,
  onCreata,
  committenteIniziale,
  anagraficaIniziale,
  parentVoceId,
  tassonomia,
}: {
  token: string;
  /** Anagrafica del rapportino: fallback quando il template manuale non ne definisce una. */
  infoCampi: TemplateInfoCampo[];
  /** Override per committente: campi esito del template manuale (se valorizzati). */
  campiPerCommittente: Partial<Record<CommittenteManuale, TemplateCampo[]>>;
  /** Anagrafica del template manuale per committente (override dell'anagrafica del "+"). */
  infoCampiPerCommittente?: Partial<Record<CommittenteManuale, TemplateInfoCampo[]>>;
  /** Campi "standard" (del template del rapportino): comandano quando non c'è override. */
  campiStandard: TemplateCampo[];
  voci: VoceMatricola[];
  onApriAssegnato: (voceId: string) => void;
  onClose: () => void;
  /** 'inviata' = partita subito (online); 'in-coda' = salvata offline, partirà alla sync.
   *  `soloRichiesta` = era una richiesta di assegnazione, non un intervento già eseguito:
   *  il rapportino non deve ricaricarsi, così se ne possono mandare altre di fila. */
  onCreata: (stato: 'inviata' | 'in-coda', soloRichiesta: boolean) => void;
  /** Pre-compilazione (task-via): committente pre-selezionato, anagrafica iniziale, link al task padre. */
  committenteIniziale?: CommittenteManuale;
  anagraficaIniziale?: AnagraficaManuale;
  parentVoceId?: string | null;
  /** Tassonomia attività (committente, descrizione, gruppo): alimenta la select obbligatoria (spec §7). */
  tassonomia?: TassonomiaRiga[];
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(committenteIniziale ? 2 : 1);
  const [committente, setCommittente] = useState<CommittenteManuale | null>(committenteIniziale ?? null);
  const [anagrafica, setAnagrafica] = useState<AnagraficaManuale>(anagraficaIniziale ?? {});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [foto, setFoto] = useState<Record<string, File>>({});
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [cercaFatta, setCercaFatta] = useState(false);

  // Anagrafica guidata dal template manuale del committente scelto (editor "Anagrafica da
  // compilare"); se quel template non la definisce, fallback all'anagrafica del rapportino.
  const campiAnag = useMemo(
    () => anagraficaCampi((committente && infoCampiPerCommittente[committente]) || infoCampi),
    [committente, infoCampiPerCommittente, infoCampi],
  );
  // Etichetta del campo attività: quella del template se lo dichiara, altrimenti il default
  // (la select si renderizza comunque: il campo è di tassonomia, non di template).
  const etichettaAttivita = campiAnag.find((c) => c.chiave === 'attivita')?.etichetta ?? 'DESCRIZIONE ATTIVITÀ';
  // `parentVoceId` valorizzato ⟺ "+" aperto sotto un task-via (voce contenitore BONIFICHE EXTRA):
  // lì la classificazione lato server è SEMPRE Italgas + BONIFICHE EXTRA, quindi la select offre
  // la SOLA "BONIFICHE EXTRA" (niente lista completa Italgas, che sarebbe fuorviante).
  const soloBonificheExtra = Boolean(parentVoceId);
  // Descrizione attività: lista chiusa dalla tassonomia (spec §7), filtrata per committente
  // equivalente ('lim_massive' → 'acea'; 'altro' → tutte le attive, nessuna riga propria).
  const opzioniAttivita = useMemo(
    () => opzioniAttivitaManuale(tassonomia, committente, { soloBonificheExtra }),
    [tassonomia, committente, soloBonificheExtra],
  );
  // Lo STANDARD (template del rapportino) comanda; il template manuale del committente fa
  // override SOLO se valorizzato. Vuoto ⇒ eredita lo standard → "modifico lo standard, segue il +".
  const override = committente ? campiPerCommittente[committente] : undefined;
  const campiEsito = committente ? (override && override.length > 0 ? override : campiStandard) : [];

  // Slot foto del template selezionato e validazione obbligatorie
  const slotFoto = campiFoto(campiEsito);
  const esitoFoto = haEsitoNegativo(risposte, campiEsito)
    ? { ok: true, mancanti: [] as string[] }
    : validaFotoObbligatorie(
        campiEsito,
        Object.fromEntries(slotFoto.map((c) => [c.chiave, foto[c.chiave] != null])),
        risposte,
      );

  // AcquaLatina: il "+" NON e' un intervento gia' fatto, e' la richiesta di farsi assegnare
  // quel misuratore. L'operatore e' sul posto e senza il task sul tablet non puo' iniziare:
  // manda la richiesta, l'ufficio assegna, e solo allora compila esito e foto sul task vero.
  // Quindi qui ci si ferma all'anagrafica: niente passo 3 (esito) e 4 (foto).
  const soloRichiesta = committente === 'acqualatina';

  const handleInvia = async () => {
    if (!committente) return;
    const mancanti = soloRichiesta ? [] : campiObbligatoriMancanti(campiEsito, risposte);
    if (mancanti.length > 0) {
      setErrore(`Compila i campi obbligatori: ${mancanti.join(', ')}.`);
      return;
    }
    if (!String(anagrafica.attivita ?? '').trim()) {
      setErrore('Scegli la descrizione attività: è obbligatoria.');
      return;
    }
    setInviando(true);
    setErrore(null);

    // Offline-first: accoda in IndexedDB (la pratica non si perde MAI), poi sincronizza.
    const esito = await accodaManuale(token, { committente, anagrafica, risposte, fotoFiles: foto, parentVoceId: parentVoceId ?? null }, Date.now());
    if (esito) {
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      void sincronizzaToken(token);
      setInviando(false);
      onCreata(online ? 'inviata' : 'in-coda', soloRichiesta);
      return;
    }

    // Fallback (IndexedDB non disponibile): invio diretto online, come da comportamento storico.
    try {
      const fd = new FormData();
      fd.append('dati', JSON.stringify({ committente, anagrafica, risposte, parentVoceId: parentVoceId ?? null }));
      for (const c of slotFoto) {
        const f = foto[c.chiave];
        if (f) fd.append(`foto:${c.chiave}`, f, f.name);
      }
      const res = await fetch(`/api/r/${token}/intervento-manuale`, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; dettaglio?: string; mancanti?: string[] };
        throw new Error(messaggioErroreManuale(j, res.status));
      }
      onCreata('inviata', soloRichiesta);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Invio non riuscito');
    } finally {
      setInviando(false);
    }
  };

  // Il passo "cerca matricola" porta la propria navigazione dentro il componente di ricerca:
  // lì il footer della Dialog resta vuoto, altrimenti ci sarebbero due "Indietro" con due
  // significati diversi.
  //
  // Due componenti e non uno con un flag: ACEA e AcquaLatina hanno la SEMANTICA OPPOSTA sul
  // non censito (là avviso morbido con "inserisci a mano", qui blocco). Vedi
  // CercaMatricolaAcqualatina.
  const passoCercaAcea = step === 2 && committente === 'lim_massive' && !cercaFatta;
  const passoCercaAcqua = step === 2 && committente === 'acqualatina' && !cercaFatta;
  const passoCerca = passoCercaAcea || passoCercaAcqua;

  // Azioni di passo nel `footer` del primitivo: barra fissa in fondo al foglio, il corpo
  // scrolla sotto (prima scorrevano insieme e su schermo corto l'"Avanti" finiva fuori vista).
  const azioni =
    step === 2 && !passoCerca ? (
      <>
        <Button size="touch" variant="outline" className="shrink-0" onClick={() => setStep(1)}>
          Indietro
        </Button>
        {soloRichiesta ? (
          <Button size="touch" variant="primary" className="flex-1" loading={inviando} disabled={inviando} onClick={handleInvia}>
            {inviando ? 'Invio…' : 'Richiedi assegnazione'}
          </Button>
        ) : (
          <Button
            size="touch"
            variant="primary"
            className="flex-1"
            onClick={() => { setRisposte((prev) => esitoPositivoDefault(campiEsito, seedRisposteDaAnagrafica(prev, anagrafica, campiEsito))); setStep(3); }}
          >
            Avanti
          </Button>
        )}
      </>
    ) : step === 3 ? (
      <>
        <Button size="touch" variant="outline" className="shrink-0" disabled={inviando} onClick={() => setStep(2)}>
          Indietro
        </Button>
        <Button size="touch" variant="primary" className="flex-1" disabled={inviando} onClick={() => setStep(4)}>
          Avanti
        </Button>
      </>
    ) : step === 4 ? (
      <>
        {/* Cosa blocca l'invio sta ACCANTO al bottone che blocca, non in fondo al corpo
            scrollabile: nel footer resta visibile anche col foglio scrollato in alto. */}
        {!esitoFoto.ok && (
          <p className="w-full text-sm font-medium text-[var(--danger)]">Mancano: {esitoFoto.mancanti.join(', ')}</p>
        )}
        {errore && <p className="w-full text-sm font-medium text-[var(--danger)]">Errore: {errore}</p>}
        <Button size="touch" variant="outline" className="shrink-0" disabled={inviando} onClick={() => setStep(3)}>
          Indietro
        </Button>
        <Button
          size="touch"
          variant="primary"
          className="flex-1"
          loading={inviando}
          disabled={!esitoFoto.ok}
          onClick={handleInvia}
        >
          {inviando ? 'Invio…' : 'Invia richiesta'}
        </Button>
      </>
    ) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title="Nuovo intervento"
      footer={azioni}
      // Il foglio è a filo dello schermo: la barra azioni deve stare sopra la home bar (§7quater).
      className="pb-[env(safe-area-inset-bottom)] sm:max-w-[480px] sm:pb-0"
    >
      {step === 1 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-[var(--brand-text-muted)]">Committente</p>
          <div className="grid grid-cols-2 gap-2">
            {COMMITTENTI.map((c) => (
              <Button
                key={c.value}
                size="touch"
                variant={committente === c.value ? 'soft' : 'outline'}
                aria-pressed={committente === c.value}
                className={`w-full ${committente === c.value ? 'border border-[var(--brand-primary)]' : ''}`}
                onClick={() => {
                  setCommittente(c.value);
                  setStep(2);
                  setCercaFatta(false);
                  const att = attivitaDefaultManuale(c.value);
                  if (att) setAnagrafica((prev) => (String(prev.attivita ?? '').trim() ? prev : { ...prev, attivita: att }));
                }}
              >
                {c.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {passoCercaAcea && (
        <CercaMatricolaLimitazione
          token={token}
          voci={voci}
          onTrovato={(m) => { setAnagrafica((prev) => ({ ...prev, ...autofillAnagrafica(m) })); setCercaFatta(true); }}
          onManuale={(matricola) => { setAnagrafica((prev) => ({ ...prev, matricola })); setCercaFatta(true); }}
          onApriAssegnato={onApriAssegnato}
          onIndietro={() => setStep(1)}
        />
      )}

      {passoCercaAcqua && (
        <CercaMatricolaAcqualatina
          token={token}
          voci={voci}
          onTrovato={(m) => { setAnagrafica((prev) => ({ ...prev, ...autofillAnagrafica(m) })); setCercaFatta(true); }}
          // `onManuale` qui NON è la scorciatoia di ACEA: lo espone solo il ramo
          // offline-senza-censimento, dove non si sa e quindi non si blocca.
          onManuale={(matricola) => { setAnagrafica((prev) => ({ ...prev, matricola })); setCercaFatta(true); }}
          onApriAssegnato={onApriAssegnato}
          onIndietro={() => setStep(1)}
        />
      )}

      {step === 2 && !passoCerca && (
        <div className="grid grid-cols-1 gap-x-2 gap-y-2.5 min-[380px]:grid-cols-2">
          {/* Attività: campo di TASSONOMIA, non di template — la cascata è SEMPRE presente,
              per ogni committente, anche se l'anagrafica del template non prevede `attivita`
              (spec §7: senza, l'obbligo client/server sarebbe insoddisfacibile). Prima il
              GRUPPO, poi il dettaglio del solo gruppo scelto: niente più scelte fuori catalogo. */}
          <SelettoreAttivitaTassonomia
            opzioni={opzioniAttivita}
            valore={String(anagrafica.attivita ?? '')}
            onChange={(attivita) => setAnagrafica((prev) => ({ ...prev, attivita }))}
            etichettaAttivita={etichettaAttivita}
          />
          {campiAnag.filter((c) => c.chiave !== 'attivita').map((c) => (
            <div key={c.chiave} className="min-w-0">
              <label className="mb-1 block truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">{c.etichetta}</label>
              <Input
                type="text"
                value={anagrafica[c.chiave] ?? ''}
                // DB pulito: l'anagrafica viene scritta SEMPRE in MAIUSCOLO. La conversione è
                // "IME-safe" (maiuscoloDigitando): su Android non muta il testo mentre la
                // tastiera compone la parola, così lo SPAZIO non cancella il campo. Il MAIUSCOLO
                // resta garantito dal CSS `uppercase` qui e, definitivo, dal server prima del DB.
                onChange={(e) => { const v = maiuscoloDigitando(e); setAnagrafica((prev) => ({ ...prev, [c.chiave]: v })); }}
                onCompositionEnd={(e) => { const v = e.currentTarget.value.toUpperCase(); setAnagrafica((prev) => ({ ...prev, [c.chiave]: v })); }}
                className="text-base uppercase"
              />
            </div>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3.5">
          {campiEsito.length === 0 && (
            <p className="text-sm text-[var(--brand-text-muted)]">Nessun campo esito per questo committente: la richiesta verrà inviata per approvazione.</p>
          )}
          {campiEsito.filter((c) => c.tipo !== 'foto').map((campo) => (
            <CampoInput key={campo.chiave} campo={campo} valore={risposte[campo.chiave]} disabilitato={inviando} onChange={(v) => setRisposte((prev) => ({ ...prev, [campo.chiave]: v }))} />
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--brand-text-muted)]">
            Carica le foto richieste. Quelle contrassegnate come <b>obbligatorie</b> servono per inviare la richiesta.
          </p>
          {slotFoto.length === 0 && (
            <p className="text-sm text-[var(--brand-text-muted)]">Questo template non richiede foto.</p>
          )}
          {slotFoto.map((c) => (
            <CampoFoto
              key={c.chiave}
              campo={c}
              file={foto[c.chiave] ?? null}
              disabilitato={inviando}
              onChange={(f) =>
                setFoto((prev) => {
                  const next = { ...prev };
                  if (f) next[c.chiave] = f;
                  else delete next[c.chiave];
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </Dialog>
  );
}