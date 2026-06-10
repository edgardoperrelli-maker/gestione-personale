'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';

/** Overlay scanner: apre la fotocamera posteriore, decodifica barcode/QR, primo codice → onCodice. */
export function ScannerMisuratore({ onCodice, onChiudi }: { onCodice: (codice: string) => void; onChiudi: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let attivo = true;
    const reader = new BrowserMultiFormatReader();
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current ?? undefined,
          (result) => {
            if (result && attivo) {
              const testo = result.getText().trim();
              if (testo) { controlsRef.current?.stop(); onCodice(testo); }
            }
          },
        );
        controlsRef.current = controls;
        if (!attivo) controls.stop();
      } catch {
        if (attivo) setErrore('Fotocamera non disponibile o permesso negato. Usa l\'inserimento manuale.');
      }
    })();
    return () => { attivo = false; controlsRef.current?.stop(); };
  }, [onCodice]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">Inquadra il codice del misuratore</span>
        <button type="button" onClick={onChiudi} className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold text-white">Annulla</button>
      </div>
      {errore ? (
        <div className="m-4 rounded-xl bg-white p-4 text-sm text-[var(--danger)]">{errore}</div>
      ) : (
        <video ref={videoRef} className="min-h-0 flex-1 object-cover" muted playsInline />
      )}
    </div>
  );
}
