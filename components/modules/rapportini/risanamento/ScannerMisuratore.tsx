'use client';
import { useEffect, useRef, useState } from 'react';
// Ponyfill: usa il BarcodeDetector NATIVO se disponibile (Android Chrome), altrimenti zxing-WASM
// (motore C++ compilato, molto più potente di zxing-JS sui barcode 1D densi — es. iOS Safari).
import { BarcodeDetector } from 'barcode-detector/pure';

const FORMATS = ['code_128', 'code_39', 'itf', 'ean_13', 'ean_8', 'upc_a', 'qr_code', 'data_matrix'];

// Risoluzione alta: i barcode densi (es. Meter Italia Code128) richiedono più pixel per essere distinguibili.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'environment',
  width: { ideal: 2560 },
  height: { ideal: 1440 },
};

/** Overlay scanner: apre la fotocamera posteriore e decodifica barcode/QR (nativo o WASM), primo codice → onCodice.
 *  Si monta UNA volta (deps []); onCodice via ref → immune ai re-render del parent. */
export function ScannerMisuratore({
  onCodice,
  onChiudi,
  etichetta = 'Inquadra il codice del misuratore',
}: {
  onCodice: (codice: string) => void;
  onChiudi: () => void;
  etichetta?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const onCodiceRef = useRef(onCodice);
  onCodiceRef.current = onCodice;

  useEffect(() => {
    let attivo = true;
    let stream: MediaStream | null = null;
    let rafId = 0;

    const ferma = () => {
      attivo = false;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    const trovato = (v: string) => {
      const t = v.trim();
      if (!t || !attivo) return;
      ferma();
      onCodiceRef.current(t);
    };

    (async () => {
      try {
        const detector = new BarcodeDetector({ formats: FORMATS as never });
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
      } catch {
        if (attivo) setErrore('Fotocamera non disponibile o permesso negato. Usa l\'inserimento manuale.');
      }
    })();

    return () => { ferma(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-white">{etichetta}</span>
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
