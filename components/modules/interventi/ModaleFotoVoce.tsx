// components/modules/interventi/ModaleFotoVoce.tsx
'use client';

import { chiediConferma } from '@/components/ui/chiediConferma';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Plus, X } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';

type Foto = { etichetta: string; fileName: string; url: string; path: string };

export default function ModaleFotoVoce({
  voceId, puoCaricare, onClose,
}: {
  voceId: string;
  puoCaricare: boolean;
  onClose: () => void;
}) {
  const [foto, setFoto] = useState<Foto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
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

  const elimina = async (path: string) => {
    if (!(await chiediConferma({ title: 'Eliminare questa foto?', message: 'Verrà rimossa anche dallo storage. Operazione non reversibile.', confirmLabel: 'Elimina', danger: true }))) return;
    setDeleting(path);
    setError(null);
    try {
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}/foto`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Errore eliminazione foto.');
      }
      await caricaFoto();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore eliminazione foto.');
    } finally {
      setDeleting(null);
    }
  };

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
    <Dialog open onClose={onClose} title="Foto intervento" className="max-w-3xl">
      {puoCaricare && (
        <div className="mb-4 flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--brand-border-strong)] bg-[var(--brand-bg)] px-3 py-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
          <Button type="button" variant="primary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
            {!uploading && <Plus size={14} aria-hidden />}
            {uploading ? 'Caricamento…' : 'Aggiungi foto mancanti'}
          </Button>
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
        <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-4 py-2 text-sm text-[var(--status-ko)]">{error}</div>
      )}
      {!loading && !error && foto.length === 0 && (
        <div className="py-10 text-center text-sm text-[var(--brand-text-muted)]">Nessuna foto per questo intervento.</div>
      )}
      {!loading && foto.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {foto.map((f, i) => (
            <div
              key={`${f.path}-${i}`}
              className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--brand-border)]"
            >
              <a href={f.url} target="_blank" rel="noreferrer" className="block" title={f.etichetta}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.etichetta} className="h-32 w-full object-cover transition group-hover:opacity-90" />
                <div className="truncate px-2 py-1 text-xs text-[var(--brand-text-muted)]">{f.etichetta}</div>
              </a>
              {puoCaricare && (
                <button
                  type="button"
                  onClick={() => void elimina(f.path)}
                  disabled={deleting === f.path}
                  title="Elimina foto"
                  aria-label="Elimina foto"
                  className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--brand-surface)] bg-[var(--danger)] leading-none text-[var(--on-danger)] shadow-[var(--shadow-md)] transition hover:brightness-110 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                >
                  {deleting === f.path ? (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  ) : (
                    <X size={14} aria-hidden />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
