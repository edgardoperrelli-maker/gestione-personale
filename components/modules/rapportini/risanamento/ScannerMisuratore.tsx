'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

// Hint zxing: ricerca approfondita + formati tipici dei misuratori (barcode 1D + QR/DataMatrix) → decodifica più affidabile.
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  ]],
]);

/** Overlay scanner: apre la fotocamera posteriore, decodifica barcode/QR, primo codice → onCodice. */
export function ScannerMisuratore({ onCodice, onChiudi }: { onCodice: (codice: string) => void; onChiudi: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  // onCodice via ref: lo scanner si monta UNA volta sola (deps []), immune ai re-render del parent.
  // Senza questo, ogni re-render (autosave, ecc.) cambiava l'identità di onCodice e l'effetto rimontava
  // la fotocamera in continuazione → non decodificava mai ("inquadra e basta").
  const onCodiceRef = useRef(onCodice);
  onCodiceRef.current = onCodice;

  useEffect(() => {
    let attivo = true;
    let localControls: IScannerControls | null = null;
    const reader = new BrowserMultiFormatReader(HINTS);
    (async () => {
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
          videoRef.current ?? undefined,
          (result) => {
            if (result && attivo) {
              const testo = result.getText().trim();
              if (testo) { attivo = false; localControls?.stop(); onCodiceRef.current(testo); }
            }
          },
        );
        localControls = controls;
        controlsRef.current = controls;
        if (!attivo) controls.stop();
      } catch {
        if (attivo) setErrore('Fotocamera non disponibile o permesso negato. Usa l\'inserimento manuale.');
      }
    })();
    return () => { attivo = false; localControls?.stop(); controlsRef.current?.stop(); };
  }, []);

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
