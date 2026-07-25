/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';
import { useRef, useState } from 'react';
import { Camera, Images, X } from 'lucide-react';
import Button from '@/components/Button';
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
    <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        <span className="shrink-0 text-xs text-[var(--brand-text-muted)]">
          {valori.length
            ? <><span className="font-mono tabular-nums">{valori.length}</span> foto</>
            : err ? <span className="text-[var(--danger)]">errore</span> : '—'}
        </span>
      </div>
      {valori.length > 0 && (
        <ul className="mb-2 grid grid-cols-3 gap-2">
          {valori.map((p, i) => (
            <li key={p} className="relative">
              <a href={`/api/r/${token}/foto-campo?path=${encodeURIComponent(p)}`} target="_blank" rel="noreferrer" className="block">
                <img
                  src={`/api/r/${token}/foto-campo?path=${encodeURIComponent(p)}`}
                  alt={`${etichetta} ${i + 1}`}
                  loading="lazy"
                  className="h-24 w-full rounded-[var(--radius-md)] object-cover"
                />
              </a>
              {/* Chip sovrapposto alla miniatura: resta a mano (cerchio a dimensione fissa, il
                  primitivo imporrebbe raggio e padding orizzontale). 44px, come il "Chiudi" di Dialog. */}
              {!disabilitato && (
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  className="absolute right-1 top-1 flex h-11 w-11 min-h-0 items-center justify-center rounded-full bg-[var(--brand-surface)]/90 text-[var(--danger)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  aria-label={`Rimuovi foto ${i + 1}`}
                >
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* I due comandi più premuti del portale: taglia `touch` (48px) obbligata (DESIGN.md §7quater). */}
      {!disabilitato && (
        <div className="flex gap-2">
          <Button variant="outline" size="touch" disabled={busy} onClick={() => camRef.current?.click()} className="flex-1">
            <Camera className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
            {busy ? 'Carico…' : 'Scatta'}
          </Button>
          <Button variant="outline" size="touch" disabled={busy} onClick={() => libRef.current?.click()} className="flex-1">
            <Images className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
            Libreria
          </Button>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={libRef} type="file" accept="image/*" aria-hidden tabIndex={-1}
        className="absolute h-px w-px overflow-hidden opacity-0" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}