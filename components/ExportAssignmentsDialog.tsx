'use client';
import { useEffect, useState } from 'react';

export default function ExportAssignmentsDialog({
  open, onClose, defaultFrom, defaultTo,
}:{
  open: boolean;
  onClose: () => void;
  defaultFrom: string; // DD-MM-YYYY
  defaultTo: string;   // DD-MM-YYYY
}) {
  const [fromIso, setFromIso] = useState(defaultFrom);
  const [toIso, setToIso] = useState(defaultTo);

  useEffect(() => {
    if (open) {
      setFromIso(defaultFrom);
      setToIso(defaultTo);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open, defaultFrom, defaultTo]);

  if (!open) return null;

  const canExport = /^\d{4}-\d{2}-\d{2}$/.test(fromIso) && /^\d{4}-\d{2}-\d{2}$/.test(toIso);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border bg-white shadow-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm text-gray-500">Esporta assegnazioni</div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Dal</span>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={fromIso}
                onChange={e=>setFromIso(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Al</span>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 bg-white"
                value={toIso}
                onChange={e=>setToIso(e.target.value)}
              />
            </label>
          </div>

          <div className="px-0 pt-3 border-t flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!canExport}
              onClick={() => {
                const a = fromIso <= toIso ? fromIso : toIso;
                const b = toIso >= fromIso ? toIso : fromIso;
                window.location.href = `/api/export/assignments?from=${a}&to=${b}`;
                onClose();
              }}
              className={`px-4 py-1.5 rounded-lg text-white ${canExport ? 'bg-gray-900 hover:bg-black' : 'bg-gray-400 cursor-not-allowed'}`}
            >
              Esporta CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
