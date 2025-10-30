'use client';

import { useState } from 'react';

export default function GestioneAttrezzaturaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [lastOk, setLastOk] = useState<string>('');

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setStatus('Caricamento master...');
    setLastOk('');
    try {
      const buf = await file.arrayBuffer();

      // timeout 45s
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45_000);

      const res = await fetch('/api/attrezzature/upload', {
        method: 'POST',
        body: buf,
        headers: {
          'content-type': 'application/octet-stream',
          'x-filename': encodeURIComponent(file.name),
        },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      let j: any = null;
      try { j = await res.json(); } catch { /* no body */ }

      if (res.ok && j?.ok) {
        const msg = `Master aggiornato: ${j.bucket}/${j.key}`;
        setStatus(msg);
        setLastOk(msg);
      } else if (res.status === 413) {
        setStatus('Errore: file troppo grande (413). Riduci dimensione o usa upload diretto su Supabase.');
      } else {
        setStatus(`Errore upload [${j?.stage || res.status}] ${j?.error || res.statusText}`);
      }
    } catch (e: any) {
      setStatus(`Errore rete/timeout: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendNow() {
    if (busy) return;
    setBusy(true);
    setStatus('Elaboro e invio email...');
    try {
      const res = await fetch('/api/attrezzature/scadenze', { method: 'GET' });
      const j = await res.json();
      if (res.ok && j?.sent) {
        setStatus(`Email inviata. Elementi: ${j.hits}`);
        setLastOk(`Ultimo invio OK • elementi: ${j.hits}`);
      } else {
        setStatus(`Errore invio: ${j?.error || res.statusText}`);
      }
    } catch (e: any) {
      setStatus(`Errore rete: ${String(e?.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Gestione Attrezzatura — Scadenziario</h1>

      <section className="mb-6 space-y-2">
        <label className="block text-sm">Carica/aggiorna file master (.xlsx)</label>
        <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={upload}
          disabled={!file || busy}
        >
          {busy ? 'Carico…' : 'Carica'}
        </button>
      </section>

      <section className="space-y-2">
        <button
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={sendNow}
          disabled={busy}
        >
          {busy ? 'Invio…' : 'Invia adesso riepilogo'}
        </button>
      </section>

      <div className="mt-4 text-sm">
        {status && <p>Stato: {status}</p>}
        {lastOk && <p className="opacity-70">✓ {lastOk}</p>}
      </div>
    </main>
  );
}
