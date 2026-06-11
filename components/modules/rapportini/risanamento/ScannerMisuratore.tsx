'use client';
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';

// Hint zxing (fallback): ricerca approfondita + formati tipici dei misuratori (barcode 1D + QR/DataMatrix).
const HINTS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.TRY_HARDER, true],
  [DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A,
    BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
  ]],
]);

// Formati per il BarcodeDetector nativo (dove disponibile).
const NATIVE_FORMATS = ['code_128', 'code_39', 'itf', 'ean_13', 'ean_8', 'upc_a', 'qr_code', 'data_matrix'];

// Risoluzione alta: i barcode densi (es. Meter Italia Code128) richiedono più pixel per essere distinguibili.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 2560 },
  height: { ideal: 1440 },
};

// BarcodeDetector non è sempre nei lib DOM → interfaccia minimale locale.
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** Overlay scanner ibrido: usa il BarcodeDetector nativo se disponibile (più potente sui barcode densi),
 *  altrimenti zxing potenziato. Si monta UNA volta (deps []), onCodice via ref → immune ai re-render del parent. */
export function ScannerMisuratore({ onCodice, onChiudi }: { onCodice: (codice: string) => void; onChiudi: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const onCodiceRef = useRef(onCodice);
  onCodiceRef.current = onCodice;

  useEffect(() => {
    let attivo = true;
    let stream: MediaStream | null = null;
    let zxingControls: IScannerControls | null = null;
    let rafId = 0;

    const fermaTutto = () => {
      attivo = false;
      if (rafId) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };

    const trovato = (v: string) => {
      const t = v.trim();
      if (!t || !attivo) return;
      fermaTutto();
      onCodiceRef.current(t);
    };

    (async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      // ── Path nativo: lettore di sistema (Android Chrome, ecc.) ──
      if (Ctor) {
        try {
          const supported = (await Ctor.getSupportedFormats?.()) ?? NATIVE_FORMATS;
          const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
          const detector = new Ctor(formats.length ? { formats } : undefined);
          stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
          if (!attivo) { stream.getTracks().forEach((t) => t.stop()); return; }
          const video = videoRef.current;
          if (!video) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.srcObject = stream;
          await video.play();
          const tick = async () => {
            if (!attivo) return;
            try {
              const codes = await detector.detect(video);
              const raw = codes[0]?.rawValue;
              if (raw) { trovato(raw); return; }
            } catch { /* frame non leggibile: continua */ }
            if (attivo) rafId = requestAnimationFrame(() => { void tick(); });
          };
          rafId = requestAnimationFrame(() => { void tick(); });
          return;
        } catch {
          stream?.getTracks().forEach((t) => t.stop());
          stream = null;
          if (!attivo) return;
          // cade nel fallback zxing sotto
        }
      }
      // ── Fallback: zxing potenziato ──
      try {
        const reader = new BrowserMultiFormatReader(HINTS);
        const controls = await reader.decodeFromConstraints(
          { video: VIDEO_CONSTRAINTS },
          videoRef.current ?? undefined,
          (result) => { if (result) trovato(result.getText()); },
        );
        zxingControls = controls;
        if (!attivo) controls.stop();
      } catch {
        if (attivo) setErrore('Fotocamera non disponibile o permesso negato. Usa l\'inserimento manuale.');
      }
    })();

    return () => { fermaTutto(); };
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
