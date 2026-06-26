'use client';
import { useEffect, useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';
import { useFotoUrl } from './useFotoUrl';

/** Uno slot foto: scatta/libreria → comprime → carica via foto-campo → onUploaded(path).
 *  Mostra l'anteprima della foto caricata (così l'operatore può controllarla). */
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
  // Anteprima locale immediata dopo lo scatto (prima che arrivi il signed URL).
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const remoteUrl = useFotoUrl(token, valore);
  const preview = localPreview ?? remoteUrl;

  // Revoca l'object URL locale quando non serve più.
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);

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
      setLocalPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(compressed); });
      onUploaded(json.path ?? null);
    } catch { setErr(true); onUploaded(null); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        {valore ? <span className="text-xs text-[var(--success)]">✓ caricata</span> : err ? <span className="text-xs text-[var(--danger)]">errore</span> : null}
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={etichetta} className="mb-2 max-h-48 w-full rounded-lg object-cover" />
      ) : valore ? (
        <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-[var(--brand-surface)] text-xs text-[var(--brand-text-muted)]">Anteprima…</div>
      ) : null}
      {!disabilitato && (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">📷 {busy ? '…' : valore ? 'Rifai' : 'Scatta'}</button>
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
