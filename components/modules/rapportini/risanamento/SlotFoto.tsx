/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';
import { useRef, useState } from 'react';
import { Camera, Check, Images } from 'lucide-react';
import Button from '@/components/Button';
import { comprimiImmagine } from '../CampoFoto';
import { acquisisciFotoNativa, fotocameraNativaDisponibile, type SorgenteFoto } from '@/lib/dispositivo/foto';

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

  /* Nativo dove c'è, input file sul web. Annullare in nativo non ricade
     sull'input: riaprirebbe un picker appena chiuso. */
  const apriSorgente = async (sorgente: SorgenteFoto, apriFallback: () => void) => {
    if (fotocameraNativaDisponibile()) {
      const f = await acquisisciFotoNativa(sorgente);
      if (f) await handle(f);
      return;
    }
    apriFallback();
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-[var(--brand-text-main)]">{etichetta}{obbligatoria ? ' *' : ''}</span>
        {valore ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--success)]">
            <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            caricata
          </span>
        ) : err ? <span className="shrink-0 text-xs text-[var(--danger)]">errore</span> : null}
      </div>
      {valore && (
        <a href={`/api/r/${token}/foto-campo?path=${encodeURIComponent(valore)}`} target="_blank" rel="noreferrer" className="mb-2 block">
          <img
            src={`/api/r/${token}/foto-campo?path=${encodeURIComponent(valore)}`}
            alt={etichetta}
            loading="lazy"
            className="h-28 w-full rounded-[var(--radius-md)] object-cover"
          />
        </a>
      )}
      {/* I due comandi più premuti del portale: taglia `touch` (48px) obbligata (DESIGN.md §7quater). */}
      {!disabilitato && (
        <div className="flex gap-2">
          <Button variant="outline" size="touch" disabled={busy} onClick={() => void apriSorgente('fotocamera', () => camRef.current?.click())} className="flex-1">
            <Camera className="h-5 w-5 shrink-0" strokeWidth={1.8} aria-hidden />
            {busy ? 'Carico…' : 'Scatta'}
          </Button>
          <Button variant="outline" size="touch" disabled={busy} onClick={() => void apriSorgente('libreria', () => libRef.current?.click())} className="flex-1">
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