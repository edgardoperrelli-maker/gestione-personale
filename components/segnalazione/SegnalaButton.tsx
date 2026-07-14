'use client';

import { useState } from 'react';

import Dialog from '@/components/ui/Dialog';
import Textarea from '@/components/ui/Textarea';

const MAX_TITLE = 200;
const MAX_BODY = 10000;

const inputClass =
  'w-full rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] placeholder:text-[var(--brand-text-subtle)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]';

/**
 * Floating action button "invia segnalazione" → hub ATLAS. Apre una Dialog con form
 * (titolo + dettaglio) che inoltra la segnalazione via /api/segnala (segreto server-side).
 */
export default function SegnalaButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const response = await fetch('/api/segnala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body: body || undefined }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Invio non riuscito.');
      }
      setMsg({ ok: true, text: 'Segnalazione inviata. Grazie!' });
      setTitle('');
      setBody('');
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : 'Invio non riuscito.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Invia segnalazione"
        title="Invia una segnalazione ad ATLAS"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[var(--on-primary)] shadow-[var(--shadow-lg)] transition hover:opacity-90"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l16-5v12L3 13v-2z" />
          <path d="M8 13v4a2 2 0 002 2h1" />
          <path d="M19 8a3 3 0 010 6" />
        </svg>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invia una segnalazione">
        <form className="space-y-4" onSubmit={submit}>
          <p className="text-sm text-[var(--brand-text-muted)]">
            Un bug, un&apos;idea o qualcosa che non va? Arriva direttamente ad ATLAS.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--brand-text-main)]" htmlFor="segnala-title">
              Cosa succede?
            </label>
            <input
              id="segnala-title"
              className={inputClass}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Riassumi in una riga"
              maxLength={MAX_TITLE}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--brand-text-main)]" htmlFor="segnala-body">
              Dettagli (opzionale)
            </label>
            <Textarea
              id="segnala-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Passi per riprodurre, contesto, cosa ti aspettavi…"
              rows={5}
              maxLength={MAX_BODY}
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Invio…' : 'Invia segnalazione'}
            </button>
            {msg ? (
              <span className={msg.ok ? 'text-sm text-[var(--brand-primary)]' : 'text-sm text-[var(--danger)]'}>
                {msg.text}
              </span>
            ) : null}
          </div>
        </form>
      </Dialog>
    </>
  );
}
