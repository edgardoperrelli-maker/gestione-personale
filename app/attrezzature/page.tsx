'use client';

import { useState } from 'react';

export default function GestioneAttrezzaturaPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  async function upload() {
    if (!file) return;
    setStatus("Caricamento...");
    const buf = await file.arrayBuffer();
    // upload via signed route API minimal (usa service key lato server in un’API dedicata)
    const res = await fetch('/api/attrezzature/upload', {
      method: 'POST',
      body: buf,
      headers: {
        'content-type': 'application/octet-stream',
        'x-filename': encodeURIComponent(file.name),
      }
    });
    const j = await res.json();
    setStatus(res.ok ? "Master aggiornato" : `Errore: ${j.error}`);
  }

  async function sendNow() {
    setStatus("Elaboro e invio email...");
    const res = await fetch('/api/attrezzature/scadenze', { method: 'GET' });
    const j = await res.json();
    setStatus(res.ok ? `Email inviata. Elementi: ${j.hits}` : `Errore: ${j.error}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Gestione attrezzatura — Scadenziario</h1>

      <div className="space-y-2">
        <label className="block text-sm">Carica/aggiorna file master (.xlsx)</label>
        <input type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button className="px-3 py-2 rounded bg-black text-white" onClick={upload} disabled={!file}>Carica</button>
      </div>

      <div className="space-y-2">
        <button className="px-3 py-2 rounded bg-black text-white" onClick={sendNow}>Invia adesso riepilogo</button>
      </div>

      <p className="text-sm">{status}</p>
    </div>
  );
}
