'use client';

import type { ErroreImport } from '@/lib/attivita/validaImport';

const TITOLI: Record<ErroreImport['tipo'], string> = {
  descrizione_mancante: 'Righe senza descrizione attività',
  descrizione_sconosciuta: 'Descrizione attività non riconosciuta',
  gruppo_incoerente: 'Gruppo attività non coerente',
};

/** Elenca al massimo 8 numeri riga, poi "e altre N". */
function righeLabel(righe: number[]): string {
  const prime = righe.slice(0, 8).join(', ');
  return righe.length > 8 ? `${prime} e altre ${righe.length - 8}` : prime;
}

export function ModaleErroreImport({ errori, onClose }: { errori: ErroreImport[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">File rifiutato</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Il file non rispetta la tassonomia attività: correggi le righe indicate e ricaricalo.
          Nessuna riga è stata importata.
        </p>
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
          {errori.map((e, i) => (
            <li key={i} className="rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950/40">
              <div className="font-medium">{TITOLI[e.tipo]}</div>
              {e.valore ? <div className="font-mono text-xs">«{e.valore}»</div> : null}
              {e.atteso ? <div className="text-xs">Atteso: «{e.atteso}»</div> : null}
              <div className="text-xs text-zinc-500">Righe file: {righeLabel(e.righe)}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Le descrizioni valide sono nel foglio «Leggenda» del template scaricabile.
        </p>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
