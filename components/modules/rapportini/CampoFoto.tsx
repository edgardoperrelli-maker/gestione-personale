'use client';

import { useEffect, useRef, useState } from 'react';
import { dimensioniTarget, JPEG_QUALITA } from '@/lib/interventi/manuali/compressioneFoto';

/** Comprime un file immagine su canvas: lato lungo ~1600px, JPEG q≈0.8. */
export async function comprimiImmagine(file: File): Promise<File> {
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('immagine non valida'));
    i.src = dataUrl;
  });

  const { width, height } = dimensioniTarget(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // fallback: nessuna compressione possibile
  ctx.drawImage(img, 0, 0, width, height);

  const blob: Blob | null = await new Promise((res) =>
    canvas.toBlob((b) => res(b), 'image/jpeg', JPEG_QUALITA),
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

export function CampoFoto({
  campo,
  file,
  disabilitato,
  onChange,
}: {
  campo: { chiave: string; etichetta: string; obbligatoria?: boolean };
  file: File | null;
  disabilitato: boolean;
  onChange: (file: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [elaboro, setElaboro] = useState(false);
  const scattoRef = useRef<HTMLInputElement>(null);
  const libreriaRef = useRef<HTMLInputElement>(null);

  // Genera/revoca l'object URL per la preview al cambio file.
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleFiles(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    setElaboro(true);
    try {
      onChange(await comprimiImmagine(f));
    } finally {
      setElaboro(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--brand-text-main)]">{campo.etichetta}</span>
        {campo.obbligatoria && (
          <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-bold text-[var(--danger)]">
            obbligatoria
          </span>
        )}
      </div>

      {preview && (
        <img
          src={preview}
          alt={campo.etichetta}
          className="mb-2 max-h-48 w-full rounded-lg object-cover"
        />
      )}

      {/*
        Input visivamente nascosti con opacity-0 + dimensioni minime (NON display:none).
        Su iOS Safari e Android Chrome il .click() programmativo su un input[type=file]
        con display:none viene silenziosamente ignorato; opacity-0 funziona sempre.
        e.target.value='' consente di ri-selezionare lo stesso file.
      */}
      <input
        ref={scattoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabilitato || elaboro}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      <input
        ref={libreriaRef}
        type="file"
        accept="image/*"
        className="absolute h-px w-px overflow-hidden opacity-0"
        aria-hidden="true"
        tabIndex={-1}
        disabled={disabilitato || elaboro}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabilitato || elaboro}
          onClick={() => scattoRef.current?.click()}
          className="rounded-lg bg-[var(--brand-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--on-primary)] transition hover:opacity-90 disabled:opacity-50"
        >
          {preview ? 'Rifai scatto' : '📷 Scatta'}
        </button>
        <button
          type="button"
          disabled={disabilitato || elaboro}
          onClick={() => libreriaRef.current?.click()}
          className="rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-text-main)] transition hover:border-[var(--brand-primary)] disabled:opacity-50"
        >
          🖼️ Libreria
        </button>
        {preview && !disabilitato && (
          <button
            type="button"
            disabled={elaboro}
            onClick={() => onChange(null)}
            className="rounded-lg border border-[var(--danger)] px-3 py-1.5 text-sm font-semibold text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
          >
            Rimuovi
          </button>
        )}
        {elaboro && <span className="self-center text-xs text-[var(--brand-text-muted)]">Elaborazione…</span>}
      </div>
    </div>
  );
}
