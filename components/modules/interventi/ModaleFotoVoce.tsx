// components/modules/interventi/ModaleFotoVoce.tsx
'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

type Foto = { etichetta: string; fileName: string; url: string };

export default function ModaleFotoVoce({
  voceId, isAdminPlus, onClose,
}: {
  voceId: string;
  isAdminPlus: boolean;
  onClose: () => void;
}) {
  const [foto, setFoto] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const caricaFoto = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}/foto`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore caricamento foto.');
      }
      const data = (await res.json()) as { foto: Foto[] };
      setFoto(Array.isArray(data.foto) ? data.foto : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento foto.');
    } finally {
      setLoading(false);
    }
  }, [voceId]);

  useEffect(() => { void caricaFoto(); }, [caricaFoto]);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('file', f);
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}/foto`, { method: 'POST', body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore upload foto.');
      }
      if (fileRef.current) fileRef.current.value = '';
      await caricaFoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore upload foto.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--brand-text-main)]">Foto intervento</h2>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="rounded-lg px-2 py-1 text-[var(--brand-text-muted)] hover:text-[var(--brand-text-main)]">✕</button>
        </div>

        {isAdminPlus && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-[var(--brand-border-strong)] bg-[var(--brand-bg)] px-3 py-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {uploading ? 'Caricamento…' : '➕ Aggiungi foto mancanti'}
            </button>
            <span className="text-xs text-[var(--brand-text-muted)]">Puoi selezionare più immagini.</span>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--brand-text-muted)]">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
            Caricamento foto…
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">{error}</div>
        )}
        {!loading && !error && foto.length === 0 && (
          <div className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessuna foto per questo intervento.</div>
        )}
        {!loading && foto.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {foto.map((f, i) => (
              <a
                key={`${f.fileName}-${i}`}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="group block overflow-hidden rounded-lg border border-[var(--brand-border)]"
                title={f.etichetta}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etichetta} className="h-32 w-full object-cover transition group-hover:opacity-90" />
                <div className="truncate px-2 py-1 text-xs text-[var(--brand-text-muted)]">{f.etichetta}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
