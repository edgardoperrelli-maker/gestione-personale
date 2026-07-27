'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import Select from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import type { Famiglia } from '@/lib/acea/saracinesche';

const oggiIso = () => new Date().toLocaleDateString('sv-SE');

/**
 * Scarica una risposta binaria come file, leggendo il nome dal `Content-Disposition`.
 *
 * Un `window.open` sarebbe più breve ma perderebbe i cookie di sessione in alcuni browser e, cosa
 * peggiore, un errore del server aprirebbe una scheda con del JSON invece di dire cosa è andato
 * storto. Qui un 404 «nessun intervento quel giorno» arriva come messaggio.
 */
async function scarica(url: string, ripiego: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Export non riuscito.');
  }
  const disp = res.headers.get('Content-Disposition') ?? '';
  const nome = /filename="([^"]+)"/.exec(disp)?.[1] ?? ripiego;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

/**
 * I due fogli che escono dal modulo.
 *
 * **Pianificato del giorno**: il foglio con cui si assegna a mano sul Cruscotto, ordinato per
 * operatore perché è così che si assegna. Serve finché il motore Playwright non sarà abbastanza
 * rapido da farlo da solo.
 *
 * **Master on-demand**: lo stesso layout del file che stiamo spegnendo, rigenerato dal registro.
 * È la via d'uscita — se qualcosa non torna, il file si riscarica invece di tenere in vita una
 * sincronizzazione che si rompe.
 */
export default function EsportaAcea({ famiglia }: { famiglia: Famiglia }) {
  const [data, setData] = useState(oggiIso);
  const [comune, setComune] = useState('');
  const [comuni, setComuni] = useState<string[]>([]);
  const [busy, setBusy] = useState<'pianificato' | 'master' | null>(null);

  useEffect(() => {
    if (famiglia !== 'massive') return;
    void (async () => {
      try {
        const res = await fetch(`/api/acea/opzioni?famiglia=${famiglia}`);
        if (!res.ok) return;
        const body = (await res.json()) as { comuni?: string[] };
        setComuni(body.comuni ?? []);
      } catch {
        /* senza tendina si scarica il master di tutti i comuni: nessun blocco */
      }
    })();
  }, [famiglia]);

  const esegui = useCallback(async (quale: 'pianificato' | 'master') => {
    setBusy(quale);
    try {
      if (quale === 'pianificato') {
        await scarica(
          `/api/acea/export-pianificato?data=${data}&famiglia=${famiglia}`,
          `acea-pianificato-${data}.xlsx`,
        );
      } else {
        const q = comune ? `&comune=${encodeURIComponent(comune)}` : '';
        await scarica(`/api/acea/export-master?famiglia=${famiglia}${q}`, `master-${famiglia}.xlsx`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export non riuscito.');
    } finally {
      setBusy(null);
    }
  }, [data, comune, famiglia]);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileSpreadsheet size={18} className="text-[var(--brand-text-muted)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Export</h2>
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--brand-text-main)]">Pianificato del giorno</span>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-label="Giorno da esportare"
            className="h-9 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm text-[var(--brand-text-main)]"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void esegui('pianificato')}
            loading={busy === 'pianificato'}
          >
            <Download size={14} aria-hidden="true" />
            Scarica
          </Button>
          <span className="w-full text-xs text-[var(--brand-text-muted)] sm:w-auto">
            ordinato per operatore, com&apos;è l&apos;assegnazione sul Cruscotto
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--brand-border)] pt-3">
          <span className="text-sm text-[var(--brand-text-main)]">Master on-demand</span>
          {famiglia === 'massive' && (
            <Select
              value={comune}
              onChange={(e) => setComune(e.target.value)}
              aria-label="Comune del master"
              className="h-9 w-52"
            >
              <option value="">Tutti i comuni</option>
              {comuni.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void esegui('master')}
            loading={busy === 'master'}
          >
            <Download size={14} aria-hidden="true" />
            Scarica
          </Button>
          <span className="w-full text-xs text-[var(--brand-text-muted)] sm:w-auto">
            stesso layout del file, rigenerato dal registro
          </span>
        </div>
      </div>
    </Card>
  );
}
