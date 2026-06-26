'use client';
import { useEffect, useRef, useState } from 'react';
import { comprimiImmagine } from '../CampoFoto';
import { useFotoUrl } from './useFotoUrl';

/** Miniatura di una singola foto (anteprima): risolve il signed URL dal path. */
function FotoThumb({
  token, path, immediate, indice, disabilitato, onRemove,
}: {
  token: string; path: string; immediate?: string; indice: number;
  disabilitato?: boolean; onRemove: () => void;
}) {
  const remoteUrl = useFotoUrl(token, path);
  const src = immediate ?? remoteUrl;
  return (
    <div className="relative overflow-hidden rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Foto ${indice + 1}`} className="h-24 w-full object-cover" />
      ) : (
        <div className="flex h-24 w-full items-center justify-center text-xs text-[var(--brand-text-muted)]">Anteprima…</div>
      )}
      {!disabilitato && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Rimuovi foto ${indice + 1}`}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs font-bold text-white"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Galleria multi-foto: aggiunge/rimuove foto a una lista, con anteprima delle foto caricate. */
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
  // Anteprima locale immediata per i path appena caricati (in attesa del signed URL).
  const [localByPath, setLocalByPath] = useState<Record<string, string>>({});

  useEffect(() => () => { Object.values(localByPath).forEach((u) => URL.revokeObjectURL(u)); }, [localByPath]);

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
      if (json.path) {
        const p = json.path;
        setLocalByPath((prev) => ({ ...prev, [p]: URL.createObjectURL(compressed) }));
        onAdd(p);
      }
    } catch { setErr(true); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        <span className="text-xs text-[var(--brand-text-muted)]">
          {valori.length ? `${valori.length} foto` : err ? <span className="text-[var(--danger)]">errore</span> : '—'}
        </span>
      </div>
      {valori.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {valori.map((p, i) => (
            <FotoThumb
              key={p}
              token={token}
              path={p}
              immediate={localByPath[p]}
              indice={i}
              disabilitato={disabilitato}
              onRemove={() => onRemove(p)}
            />
          ))}
        </div>
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
