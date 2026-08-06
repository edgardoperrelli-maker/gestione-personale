'use client';

import { useEffect, useMemo, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import { valoreRiga, totaleContabilita } from '@/lib/pi/contabilita';
import { euroIt } from '@/utils/numero-it';

type Articolo = { codice: string; descrizione: string | null; unita_misura: string | null; prezzo_unitario: number; attivo: boolean };
type RigaSalvata = { articolo_codice: string; quantita: number };

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
/** Importi in euro (contabilità): formato it-IT con valuta. */
const fmtEuro = (n: number) => euroIt(n);

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
          <div className="text-sm">Totale: <span className="font-mono font-semibold tabular-nums">{fmtEuro(totale)}</span></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Chiudi</Button>
            <Button variant="primary" loading={salvataggio} onClick={salva}>
              {salvataggio ? 'Salvataggio…' : 'Salva contabilità'}
            </Button>
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
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{fmtEuro(Number(a.prezzo_unitario))}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.001"
                        value={qta[a.codice] ?? ''}
                        onChange={(e) => setQta((m) => ({ ...m, [a.codice]: e.target.value }))}
                        className="w-24 text-right tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 text-right font-mono font-medium tabular-nums">{q > 0 ? fmtEuro(valoreRiga(q, a.prezzo_unitario)) : '—'}</td>
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
