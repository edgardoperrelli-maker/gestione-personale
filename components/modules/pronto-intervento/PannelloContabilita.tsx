'use client';

import { useEffect, useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { valoreRiga, totaleContabilita } from '@/lib/pi/contabilita';

type Articolo = { codice: string; descrizione: string | null; unita_misura: string | null; prezzo_unitario: number; attivo: boolean };
type RigaSalvata = { articolo_codice: string; quantita: number };

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export default function PannelloContabilita({
  interventoId,
  onClose,
  onSaved,
}: {
  interventoId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [listino, setListino] = useState<Articolo[]>([]);
  const [qta, setQta] = useState<Record<string, string>>({});
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch(`/api/admin/pi/interventi/${interventoId}/contabilita`, { cache: 'no-store' });
      if (!alive) return;
      if (res.ok) {
        const j = await res.json();
        setListino((j.listino ?? []) as Articolo[]);
        const map: Record<string, string> = {};
        for (const r of (j.righe ?? []) as RigaSalvata[]) map[r.articolo_codice] = String(r.quantita);
        setQta(map);
      }
      setCaricamento(false);
    })();
    return () => { alive = false; };
  }, [interventoId]);

  const righeAttive = useMemo(
    () => listino.map((a) => ({ ...a, q: num(qta[a.codice]) })).filter((a) => a.attivo || a.q > 0),
    [listino, qta],
  );
  const totale = useMemo(
    () => totaleContabilita(righeAttive.map((a) => ({ quantita: a.q, prezzo_snapshot: a.prezzo_unitario }))),
    [righeAttive],
  );

  async function salva() {
    setSalvataggio(true);
    const righe = listino.map((a) => ({ articolo_codice: a.codice, quantita: num(qta[a.codice]) })).filter((r) => r.quantita > 0);
    const res = await fetch(`/api/admin/pi/interventi/${interventoId}/contabilita`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ righe }),
    });
    setSalvataggio(false);
    if (res.ok) onSaved();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Contabilità intervento"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">Totale: <span className="font-semibold">{totale.toFixed(2)} €</span></div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm font-medium">Chiudi</button>
            <button type="button" disabled={salvataggio} onClick={salva} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] disabled:opacity-50">
              {salvataggio ? 'Salvataggio…' : 'Salva contabilità'}
            </button>
          </div>
        </div>
      }
    >
      {caricamento ? (
        <p className="text-sm text-[var(--brand-text-muted)]">Caricamento…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--brand-border)] text-left text-xs text-[var(--brand-text-muted)]">
                <th className="py-2 pr-2">Codice</th>
                <th className="py-2 pr-2">Descrizione</th>
                <th className="py-2 pr-2">U.M.</th>
                <th className="py-2 pr-2 text-right">Prezzo</th>
                <th className="py-2 pr-2 text-right">Quantità</th>
                <th className="py-2 text-right">Valore</th>
              </tr>
            </thead>
            <tbody>
              {listino.filter((a) => a.attivo || num(qta[a.codice]) > 0).map((a) => {
                const q = num(qta[a.codice]);
                return (
                  <tr key={a.codice} className="border-b border-[var(--brand-border)]">
                    <td className="py-1.5 pr-2 font-mono text-xs">{a.codice}</td>
                    <td className="py-1.5 pr-2">{a.descrizione}</td>
                    <td className="py-1.5 pr-2">{a.unita_misura}</td>
                    <td className="py-1.5 pr-2 text-right">{Number(a.prezzo_unitario).toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.001"
                        value={qta[a.codice] ?? ''}
                        onChange={(e) => setQta((m) => ({ ...m, [a.codice]: e.target.value }))}
                        className="w-24 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-1.5 text-right font-medium">{q > 0 ? valoreRiga(q, a.prezzo_unitario).toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
