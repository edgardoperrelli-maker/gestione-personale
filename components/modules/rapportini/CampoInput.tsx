'use client';

import { useEffect, useRef, useState } from 'react';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import { comprimiImmagine } from './CampoFoto';
import { useUploadFoto } from './RapportinoFotoCtx';
import { isPlaceholderFoto } from '@/lib/offline/fotoPlaceholder';
import { leggiBlobFoto } from '@/lib/offline/persistFoto';

const inputCls =
  'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-3 py-2 text-base text-[var(--brand-text-main)] placeholder-[var(--brand-text-muted)] focus:border-[var(--brand-primary)] focus:outline-none disabled:opacity-70';

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
        className={`flex min-h-[50px] items-center gap-3 rounded-xl border p-3 transition ${
          checked
            ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary)]'
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
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
      {campo.etichetta}
      {campo.obbligatoria && <span className="ml-1 font-bold text-[var(--danger)]">*</span>}
    </label>
  );

  if (campo.tipo === 'select') {
    return (
      <div>
        {labelEl}
        <select value={typeof valore === 'string' ? valore : ''} disabled={disabilitato} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          <option value="">— Seleziona —</option>
          {(campo.opzioni ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (campo.tipo === 'numero') {
    return (
      <div>
        {labelEl}
        <input
          type="number"
          inputMode="decimal"
          value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
          disabled={disabilitato}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={inputCls}
        />
      </div>
    );
  }

  if (campo.tipo === 'foto') {
    return <CampoFotoInput campo={campo} valore={valore} disabilitato={disabilitato} onChange={onChange} />;
  }

  return (
    <div>
      {labelEl}
      <TextareaAuto valore={typeof valore === 'string' ? valore : ''} disabilitato={disabilitato} onChange={onChange} evidenzia={evidenzia} />
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
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
        {campo.etichetta}
        {campo.obbligatoria && <span className="ml-1 font-bold text-[var(--danger)]">*</span>}
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
        <button
          type="button"
          disabled={disabilitato || busy}
          onClick={() => scattoRef.current?.click()}
          className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[oklch(0.16_0.06_245)] transition hover:opacity-90 disabled:opacity-50"
        >
          {hasFotoEsistente || inAttesaRete || uploadStato === 'ok' ? '📷 Rifai scatto' : '📷 Scatta'}
        </button>
        <button
          type="button"
          disabled={disabilitato || busy}
          onClick={() => libreriaRef.current?.click()}
          className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] disabled:opacity-50"
        >
          🖼️ Libreria
        </button>
        {busy && <span className="text-xs text-[var(--brand-text-muted)]">Caricamento…</span>}
        {!busy && uploadStato === 'ok' && (
          <span className="text-xs font-semibold text-[var(--success)]">✓ Caricata</span>
        )}
        {!busy && uploadStato === 'errore' && (
          <span className="text-xs font-semibold text-[var(--danger)]">Errore upload</span>
        )}
        {!busy && inAttesaRete && (
          <span className="text-xs font-semibold text-[var(--warning-fg,#92400e)]">⏳ in attesa di rete</span>
        )}
        {!busy && uploadStato === 'idle' && hasFotoEsistente && (
          <span className="text-xs font-semibold text-[var(--success)]">✓ Già presente</span>
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
    <textarea
      ref={ref}
      rows={1}
      value={valore}
      disabled={disabilitato}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} resize-none overflow-hidden ${evidenzia ? 'border-[var(--danger)] ring-1 ring-[var(--danger)]' : ''}`}
    />
  );
}
