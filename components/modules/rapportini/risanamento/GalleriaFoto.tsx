'use client';
import { useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';

/** Galleria multi-foto: aggiunge/rimuove foto a una lista. Carica via foto-campo. */
export function GalleriaFoto({
  token, etichetta, valori, obbligatoria, disabilitato, onAdd, onRemove,
}: {
  token: string; etichetta: string; valori: string[];
  obbligatoria?: boolean; disabilitato?: boolean;
  onAdd: (path: string) => void; onRemove: (path: string) => void;
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
      if (!res.ok) { setErr(true); return; }
      const json = (await res.json()) as { path?: string };
      if (json.path) onAdd(json.path);
    } catch { setErr(true); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        <span className="text-xs text-[var(--brand-text-muted)]">
          {valori.length ? `${valori.length} foto` : err ? <span className="text-[var(--danger)]">errore</span> : '—'}
        </span>
      </div>
      {valori.length > 0 && (
        <ul className="mb-2 space-y-1">
          {valori.map((p, i) => (
            <li key={p} className="flex items-center justify-between rounded-lg bg-[var(--brand-surface)] px-2 py-1 text-xs">
              <span className="text-[var(--success)]">✓ Foto {i + 1}</span>
              {!disabilitato && (
                <button type="button" onClick={() => onRemove(p)} className="text-[var(--danger)]" aria-label={`Rimuovi foto ${i + 1}`}>✕</button>
              )}
            </li>
          ))}
        </ul>
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
