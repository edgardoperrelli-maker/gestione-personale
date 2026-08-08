/* Hallmark · redesign: Cockpit-aligned · variante: campo (DESIGN.md §7quater) · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Images } from 'lucide-react';
import Button from '@/components/Button';
import { dimensioniTarget, TENTATIVI_COMPRESSIONE, MAX_FOTO_BYTES } from '@/lib/interventi/manuali/compressioneFoto';
import { acquisisciFotoNativa, fotocameraNativaDisponibile, type SorgenteFoto } from '@/lib/dispositivo/foto';

/** Ricodifica il canvas in JPEG alla qualità data (Promise-wrapper di `toBlob`). */
function canvasToJpeg(canvas: HTMLCanvasElement, qualita: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/jpeg', qualita));
}

/**
 * Comprime un file immagine su canvas puntando a un payload piccolo (≤ `MAX_FOTO_BYTES`).
 *
 * Su rete debole un body multipart troppo grande arriva TRONCATO al server, `req.formData()`
 * fallisce e l'invio del "+" resta bloccato in sincronizzazione (caso reale: un operatore, decine
 * di POST falliti di fila). Per evitarlo proviamo la scaletta `TENTATIVI_COMPRESSIONE`: prima 1600px
 * @ 0.8 (identico a prima per le foto già leggere → si ferma subito), poi qualità più bassa e, se
 * serve, risoluzione più bassa (1280 → 1024). Così il payload è SEMPRE piccolo — non si spedisce mai
 * il file originale full-size — anche sui telefoni dove `toBlob` a piena risoluzione fallisce. Ci si
 * ferma al primo tentativo sotto il tetto; altrimenti si tiene il più leggero ottenuto.
 */
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

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // fallback: nessuna compressione possibile

  let migliore: Blob | null = null;
  for (const tentativo of TENTATIVI_COMPRESSIONE) {
    const { width, height } = dimensioniTarget(img.naturalWidth, img.naturalHeight, tentativo.lato);
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await canvasToJpeg(canvas, tentativo.qualita);
    if (blob && (!migliore || blob.size < migliore.size)) migliore = blob;
    if (migliore && migliore.size <= MAX_FOTO_BYTES) break; // abbastanza leggera: fermati
  }
  if (!migliore) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto';
  return new File([migliore], `${baseName}.jpg`, { type: 'image/jpeg' });
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

  async function handleFile(f: File) {
    setElaboro(true);
    try {
      onChange(await comprimiImmagine(f));
    } finally {
      setElaboro(false);
    }
  }

  function handleFiles(list: FileList | null) {
    const f = list?.[0];
    if (f) void handleFile(f);
  }

  /**
   * Nella shell nativa passa dal plugin, sul web apre l'input di sempre.
   * Annullare in nativo NON ricade sull'input: aprirebbe un secondo picker
   * subito dopo che l'utente ha appena chiuso il primo.
   */
  async function apriSorgente(sorgente: SorgenteFoto, apriFallback: () => void) {
    if (fotocameraNativaDisponibile()) {
      const f = await acquisisciFotoNativa(sorgente);
      if (f) await handleFile(f);
      return;
    }
    apriFallback();
  }

  return (
    <div className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--brand-text-main)]">{campo.etichetta}</span>
        {campo.obbligatoria && (
          <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
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
        <Button
          variant="primary"
          size="touch"
          disabled={disabilitato || elaboro}
          onClick={() => void apriSorgente('fotocamera', () => scattoRef.current?.click())}
        >
          <Camera className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {preview ? 'Rifai scatto' : 'Scatta'}
        </Button>
        <Button
          variant="outline"
          size="touch"
          disabled={disabilitato || elaboro}
          onClick={() => void apriSorgente('libreria', () => libreriaRef.current?.click())}
        >
          <Images className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Libreria
        </Button>
        {preview && !disabilitato && (
          /* Danger "quieto" (bordo + testo, non fill): due utility arbitrarie dello stesso
             gruppo-colore competerebbero in cascata con quelle della variante `outline`,
             l'inline style col token è invece deterministico. */
          <Button
            variant="outline"
            size="touch"
            disabled={elaboro}
            onClick={() => onChange(null)}
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
            className="hover:bg-[var(--danger-soft)]"
          >
            Rimuovi
          </Button>
        )}
        {elaboro && <span className="self-center text-xs text-[var(--brand-text-muted)]">Elaborazione…</span>}
      </div>
    </div>
  );
}