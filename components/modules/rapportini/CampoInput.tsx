/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, CloudOff, Images, ScanLine } from 'lucide-react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { comprimiImmagine } from './CampoFoto';
import { ScannerMisuratore } from './risanamento/ScannerMisuratore';
import { useUploadFoto } from './RapportinoFotoCtx';
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { leggiBlobFoto } from '@/lib/offline/persistFoto';
import { maiuscoloDigitando } from '@/lib/testo/maiuscolo';

/**
 * I campi del portale operatore restano a 16px: sotto i 16 iOS Safari ZOOMA la pagina
 * al focus e l'operatore si ritrova la scheda fuori schermo. I primitivi
 * (Input/Select/Textarea) nascono a `text-sm` per la console — qui si rialzano.
 */
const campoCls = 'text-base';

export function CampoInput({
  campo,
  valore,
  disabilitato,
  onChange,
  evidenzia,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (valore: unknown) => void;
  evidenzia?: boolean;
}) {
  if (campo.tipo === 'crocetta') {
    const checked = valore === true;
    return (
      <label
        className={`flex min-h-[50px] items-center gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-[var(--brand-primary)] ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--primary-text)]'
            : 'border-[var(--brand-border)] bg-[var(--brand-surface-muted)] text-[var(--brand-text-main)]'
        } ${disabilitato ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.checked)}
          className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
        />
        <span className="text-sm font-semibold">
          {campo.etichetta}
          {campo.obbligatoria && <span className="ml-1 text-[var(--danger)]">*</span>}
        </span>
      </label>
    );
  }

  const labelEl = (
    <label className="mb-1 block text-xs font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">
      {campo.etichetta}
      {campo.obbligatoria && <span className="ml-1 font-semibold text-[var(--danger)]">*</span>}
    </label>
  );

  if (campo.tipo === 'select') {
    return (
      <div>
        {labelEl}
        <Select value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={campoCls}>
          <option value="">— Seleziona —</option>
          {(campo.opzioni ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      </div>
    );
  }

  if (campo.tipo === 'numero') {
    return (
      <div>
        {labelEl}
        <Input
          type="number"
          inputMode="decimal"
          value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={campoCls}
        />
      </div>
    );
  }

  if (campo.tipo === 'ora') {
    return (
      <div>
        {labelEl}
        <Input
          type="time"
          value={typeof valore === 'string' ? valore : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value)}
          className={campoCls}
        />
      </div>
    );
  }

  if (campo.tipo === 'foto') {
    return <CampoFotoInput campo={campo} valore={valore} disabilitato={disabilitato} onChange={onChange} />;
  }

  if (campo.tipo === 'matricola') {
    return <CampoMatricolaInput campo={campo} valore={valore} disabilitato={disabilitato} onChange={onChange} />;
  }

  return (
    <div>
      {labelEl}
      <TextareaAuto valore={typeof valore === 'string' ? valore : ''} disabilitato={disabilitato} onChange={onChange} evidenzia={evidenzia} />
    </div>
  );
}

/**
 * Campo MATRICOLA: la si scansiona dal codice a barre o la si scrive a mano.
 *
 * Le due vie scrivono lo STESSO valore nella stessa risposta — lo scanner è una scorciatoia,
 * non un percorso separato: fotocamera negata, buio, etichetta rovinata o codice illeggibile
 * e l'operatore digita, senza restare bloccato sul posto. Per la stessa ragione qui non c'è
 * nessuna verifica a catalogo: il misuratore INSTALLATO è nuovo, in nessun elenco nostro (il
 * controllo sul censito riguarda quello RIMOSSO, e sta in `CercaMatricolaAcqualatina`).
 *
 * Il testo va in MAIUSCOLO come gli altri campi liberi: stessa meccanica IME-safe della
 * textarea (`maiuscoloDigitando` + `onCompositionEnd`), col server che normalizza comunque.
 */
function CampoMatricolaInput({
  campo, valore, disabilitato, onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (v: unknown) => void;
}) {
  const [scanner, setScanner] = useState(false);
  const testo = typeof valore === 'string' ? valore : '';

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">
        {campo.etichetta}
        {campo.obbligatoria && <span className="ml-1 font-semibold text-[var(--danger)]">*</span>}
      </label>
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Matricola"
          aria-label={campo.etichetta}
          value={testo}
          disabled={disabilitato}
          onChange={(e) => onChange(maiuscoloDigitando(e))}
          onCompositionEnd={(e) => onChange(e.currentTarget.value.toUpperCase())}
          className={`${campoCls} min-w-0 flex-1 font-mono uppercase tabular-nums`}
        />
        <Button
          variant="soft"
          size="touch"
          disabled={disabilitato}
          onClick={() => setScanner(true)}
          aria-label={`Scansiona ${campo.etichetta}`}
          title="Scansiona il codice a barre"
          className="shrink-0"
        >
          <ScanLine className="h-5 w-5" strokeWidth={1.8} aria-hidden />
        </Button>
      </div>

      {scanner && (
        <ScannerMisuratore
          etichetta="Inquadra il codice del misuratore installato"
          onCodice={(codice) => { setScanner(false); onChange(codice.trim().toUpperCase()); }}
          onChiudi={() => setScanner(false)}
        />
      )}
    </div>
  );
}

/**
 * Input foto per il rapportino regolare (VoceFocus).
 * Comprime lato client, carica su storage via /api/r/[token]/foto-campo,
 * poi chiama onChange(path) per salvare il percorso nelle risposte.
 */
function CampoFotoInput({
  campo, valore, disabilitato, onChange,
}: {
  campo: TemplateCampo;
  valore: unknown;
  disabilitato: boolean;
  onChange: (v: unknown) => void;
}) {
  const uploadFoto = useUploadFoto();
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStato, setUploadStato] = useState<'idle' | 'ok' | 'errore'>('idle');
  const scattoRef = useRef<HTMLInputElement>(null);
  const libreriaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localFile) { setPreview(null); return; }
    const url = URL.createObjectURL(localFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);

  // Anteprima da blob locale per le foto in attesa di rete (placeholder), alla riapertura.
  useEffect(() => {
    if (localFile) return; // l'anteprima di sessione ha la precedenza
    if (!isPlaceholderFoto(valore)) return;
    let attivo = true;
    let url: string | null = null;
    void leggiBlobFoto(valore).then((blob) => {
      if (!attivo || !blob) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    });
    return () => { attivo = false; if (url) URL.revokeObjectURL(url); };
  }, [valore, localFile]);

  async function handleFiles(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setUploadStato('idle');
    setUploading(true);
    try {
      const compressed = await comprimiImmagine(f);
      setLocalFile(compressed);
      const path = await uploadFoto(campo.chiave, compressed);
      if (path) {
        onChange(path);
        setUploadStato('ok');
      } else {
        setUploadStato('errore');
      }
    } catch {
      setUploadStato('errore');
    } finally {
      setUploading(false);
    }
  }

  const inAttesaRete = isPlaceholderFoto(valore);
  const hasFotoEsistente = !localFile && typeof valore === 'string' && valore.length > 0 && !inAttesaRete;
  const busy = uploading;

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-tight text-[var(--brand-text-muted)]">
        {campo.etichetta}
        {campo.obbligatoria && <span className="ml-1 font-semibold text-[var(--danger)]">*</span>}
      </label>

      {preview && (
        <img src={preview} alt={campo.etichetta} className="mb-2 max-h-40 w-full rounded-lg object-cover" />
      )}

      {/* Input nascosti con opacity-0 (mobile-safe: display:none blocca il click su iOS) */}
      <input
        ref={scattoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden
        tabIndex={-1}
        disabled={disabilitato || busy}
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={libreriaRef}
        type="file"
        accept="image/*"
        className="absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden
        tabIndex={-1}
        disabled={disabilitato || busy}
        onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="touch"
          disabled={disabilitato || busy}
          onClick={() => scattoRef.current?.click()}
        >
          <Camera className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {hasFotoEsistente || inAttesaRete || uploadStato === 'ok' ? 'Rifai scatto' : 'Scatta'}
        </Button>
        <Button
          variant="outline"
          size="touch"
          disabled={disabilitato || busy}
          onClick={() => libreriaRef.current?.click()}
        >
          <Images className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Libreria
        </Button>
        {busy && <span className="text-xs text-[var(--brand-text-muted)]">Caricamento…</span>}
        {!busy && uploadStato === 'ok' && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--success)]">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Caricata
          </span>
        )}
        {!busy && uploadStato === 'errore' && (
          <span className="text-xs font-semibold text-[var(--danger)]">Errore upload</span>
        )}
        {!busy && inAttesaRete && (
          /* Era `text-[var(--warning-fg,#92400e)]`: token inesistente → rendeva l'hex di
             fallback, fisso in light e dark. Ora `--status-warn`, il token d'intento
             «warn / in attesa» (§3): il colore È l'informazione, come per gli altri due
             stati qui accanto (`--success` caricata, `--danger` errore). */
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-warn)]">
            <CloudOff className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            in attesa di rete
          </span>
        )}
        {!busy && uploadStato === 'idle' && hasFotoEsistente && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--success)]">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Già presente
          </span>
        )}
      </div>
    </div>
  );
}

/** Textarea compatta: parte da una riga ed espande in altezza solo quando viene popolata. */
function TextareaAuto({ valore, disabilitato, onChange, evidenzia }: { valore: string; disabilitato: boolean; onChange: (v: unknown) => void; evidenzia?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [valore]);
  return (
    <Textarea
      ref={ref}
      rows={1}
      value={valore}
      disabled={disabilitato}
      error={evidenzia}
      // DB pulito: il testo libero viene scritto SEMPRE in MAIUSCOLO. La conversione è "IME-safe"
      // (maiuscoloDigitando): su Android non muta il testo mentre la tastiera compone la parola, così
      // lo SPAZIO non cancella il campo. Il MAIUSCOLO definitivo lo garantisce comunque il server.
      onChange={(e) => onChange(maiuscoloDigitando(e))}
      onCompositionEnd={(e) => onChange(e.currentTarget.value.toUpperCase())}
      className={`${campoCls} resize-none overflow-hidden uppercase ${evidenzia ? 'ring-1 ring-[var(--status-ko)]' : ''}`}
    />
  );
}