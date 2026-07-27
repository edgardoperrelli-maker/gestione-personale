'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import { toast } from '@/components/ui/Toast';
import { chiediConferma } from '@/components/ui/chiediConferma';
import RiepilogoImport, { type EsitoImport } from './RiepilogoImport';

const ENDPOINT = '/api/acea/import';

type StoricoImport = {
  id: string;
  nome_file: string | null;
  righe_totali: number;
  righe_nuove: number;
  righe_modificate: number;
  righe_invariate: number;
  righe_annullate: number;
  finestra_dal: string | null;
  finestra_al: string | null;
  caricato_il: string;
};

const dataOra = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Caricamento dell'export del Cruscotto ACEA.
 *
 * Il file si scarica a mano dal portale e si trascina qui, senza toccarlo: l'app è la fonte di
 * verità e il file resta il sorgente immutabile. Un file già caricato non viene riprocessato in
 * silenzio — l'app lo dice e chiede conferma, perché a caricare sono più admin.
 */
export default function ImportCard({ onImportato }: { onImportato?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<EsitoImport | null>(null);
  const [storico, setStorico] = useState<StoricoImport[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  const caricaStorico = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT);
      if (res.ok) setStorico((await res.json()) as StoricoImport[]);
    } catch {
      /* lo storico è contorno: se non arriva, l'import funziona lo stesso */
    }
  }, []);

  useEffect(() => { void caricaStorico(); }, [caricaStorico]);

  const invia = useCallback(async (conferma: boolean) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (conferma) fd.append('conferma', '1');
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const body = (await res.json()) as Record<string, unknown>;

      if (res.status === 409 && body.error === 'file_gia_importato') {
        const p = body.precedente as { caricato_il: string; righe_totali: number } | undefined;
        const ok = await chiediConferma({
          title: 'File già caricato',
          message: p
            ? `Questo stesso file è stato importato il ${dataOra(p.caricato_il)} (${p.righe_totali} righe). Vuoi rielaborarlo?`
            : 'Questo file risulta già importato. Vuoi rielaborarlo?',
          confirmLabel: 'Rielabora',
        });
        if (ok) await invia(true);
        return;
      }
      if (!res.ok) {
        const dettagli = Array.isArray(body.dettagli) ? ` (${(body.dettagli as string[]).join(', ')})` : '';
        toast.error(`${String(body.error ?? 'Import non riuscito.')}${dettagli}`);
        return;
      }

      setEsito(body as unknown as EsitoImport);
      toast.success('Export importato.');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      await caricaStorico();
      onImportato?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [file, caricaStorico, onImportato]);

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Import export ACEA</h2>
        <p className="mt-0.5 text-xs text-[var(--brand-text-muted)]">
          Scarica l&apos;export dal Cruscotto senza modificarlo e caricalo qui. Il file è sempre il
          totale: le righe identiche vengono saltate, gli ordini annullati escono dal registro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          `<label>` collegata e non solo un `aria-label`: senza nome accessibile un input file viene
          annunciato come «pulsante Scegli file» e basta, indistinguibile da qualunque altro nella
          pagina. La label e` visivamente nascosta perche` il riquadro dice gia` cosa si carica.
        */}
        <label htmlFor={idFile} className="sr-only">
          File xlsx dell&apos;export ACEA
        </label>
        <input
          id={idFile}
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full max-w-sm cursor-pointer rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--brand-surface-muted)] file:px-3 file:py-1 file:text-sm file:text-[var(--brand-text-main)]"
        />
        <Button variant="primary" onClick={() => void invia(false)} disabled={!file} loading={busy}>
          <Upload size={16} aria-hidden="true" />
          Importa
        </Button>
      </div>

      {esito && <RiepilogoImport esito={esito} />}

      {storico.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--brand-text-muted)]">Import precedenti</h3>
          <ul className="mt-1 divide-y divide-[var(--brand-border)] text-xs">
            {storico.slice(0, 5).map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-[var(--brand-text-main)]">
                  {dataOra(s.caricato_il)}
                  {s.nome_file ? ` · ${s.nome_file}` : ''}
                </span>
                <span className="font-mono tabular-nums text-[var(--brand-text-muted)]">
                  {s.righe_totali} righe · {s.righe_nuove} nuove · {s.righe_modificate} mod. · {s.righe_annullate} annull.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
