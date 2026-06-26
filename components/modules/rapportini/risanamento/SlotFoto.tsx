'use client';
import { useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';

/** Uno slot foto: scatta/libreria → comprime → carica via foto-campo → onUploaded(path). */
export function SlotFoto({
  token, etichetta, valore, obbligatoria, disabilitato, onUploaded,
}: {
  token: string; etichetta: string; valore?: string | null;
  obbligatoria?: boolean; disabilitato?: boolean;
  onUploaded: (path: string | null) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const handle = async (f: File | undefined) => {
    if (!f || busy) return;
    setBusy(true); setErr(false);
    try {
      const compressed = await comprimiImmagine(f);
      const fd = new FormData();
      fd.append('file', compressed, compressed.name);
      const res = await fetch(`/api/r/${token}/foto-campo`, { method: 'POST', body: fd });
      if (!res.ok) { setErr(true); onUploaded(null); return; }
      const json = (await res.json()) as { path?: string };
      onUploaded(json.path ?? null);
    } catch { setErr(true); onUploaded(null); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        {valore ? <span className="text-xs text-[var(--success)]">✓ caricata</span> : err ? <span className="text-xs text-[var(--danger)]">errore</span> : null}
      </div>
      {valore && (
        <a href={`/api/r/${token}/foto-campo?path=${encodeURIComponent(valore)}`} target="_blank" rel="noreferrer" className="mb-2 block">
          <img
            src={`/api/r/${token}/foto-campo?path=${encodeURIComponent(valore)}`}
            alt={etichetta}
            loading="lazy"
            className="h-28 w-full rounded-lg object-cover"
          />
        </a>
      )}
      {!disabilitato && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">📷 {busy ? '…' : 'Scatta'}</button>
          <button type="button" disabled={busy} onClick={() => libRef.current?.click()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">🖼️ Libreria</button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libRef} type="file" accept="image/*" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}
