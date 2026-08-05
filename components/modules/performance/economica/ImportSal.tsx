'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import { toast } from '@/components/ui/Toast';
import { chiediConferma } from '@/components/ui/chiediConferma';
import { eur, num } from './tipi';

const ENDPOINT = '/api/admin/acea/sal';

interface Lotto {
  dataRegistrazione: string;
  meseCompetenza: string;
  righeTotali: number;
  ordini: number;
  valore: number;
  salN: number;
  righeGiaInDb: number;
  giaCaricato: boolean;
}
interface SalInDb {
  n: number;
  righe: number;
  ordini: number;
  valore: number;
  dal: string;
  al: string;
}
interface Anteprima {
  anteprima: true;
  file: string;
  righeLette: number;
  scartate: number;
  lotti: Lotto[];
  salInDb: SalInDb[];
}

const dataIT = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const meseIT = (m: string) => (m ? `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '—');

/**
 * Import del file SAL ufficiale ACEA, dentro la pagina che poi lo usa.
 *
 * Prima i SAL entravano solo dal bottone «Leggi SAL» del modulo Agente, che legge una cartella su
 * un PC in ufficio: quando quel PC è spento — o quando il file arriva per email — non c'era altro
 * modo, e la verifica di fine mese finiva per essere fatta a mano fuori dall'applicazione.
 *
 * Il gesto è in due tempi ed è voluto: il file di ACEA è CUMULATIVO — contiene tutti i SAL emessi
 * dall'inizio della commessa — quindi caricarlo senza guardare vorrebbe dire riscrivere anche i
 * SAL già pagati. L'anteprima mostra come il file si divide, quale pezzo è già in banca dati e
 * con che numero entrerebbe il resto; il numero resta correggibile, perché a decidere quanti SAL
 * ci sono in un mese è il committente e non una regola.
 */
export default function ImportSal({ onImportato }: { onImportato?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [scelte, setScelte] = useState<Record<string, string>>({});
  const [salInDb, setSalInDb] = useState<SalInDb[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const idFile = useId();

  const caricaElenco = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { cache: 'no-store' });
      if (!res.ok) return;
      setSalInDb(((await res.json()) as { sal?: SalInDb[] }).sal ?? []);
    } catch {
      /* l'elenco è contorno: se non arriva, l'import funziona lo stesso */
    }
  }, []);

  useEffect(() => { void caricaElenco(); }, [caricaElenco]);

  const analizza = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setAnteprima(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as Anteprima & { error?: string; dettagli?: string[] };
      if (!res.ok) {
        toast.error([body.error ?? 'Lettura del file non riuscita.', (body.dettagli ?? []).join(', ')].filter(Boolean).join(' — '));
        return;
      }
      setAnteprima(body);
      /*
        I lotti già caricati partono DESELEZIONATI: ricaricarli non cambierebbe i numeri ma
        cancellerebbe e riscriverebbe righe che vanno bene, e con esse la loro data di raccolta.
        Chi vuole davvero riscriverli lo dice spuntandoli.
      */
      setScelte(Object.fromEntries(body.lotti.map((l) => [l.dataRegistrazione, l.giaCaricato ? '' : String(l.salN)])));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lettura del file non riuscita.');
    } finally {
      setBusy(false);
    }
  }, [file]);

  const applica = useCallback(async () => {
    if (!file || !anteprima) return;
    const assegnazioni = Object.fromEntries(
      Object.entries(scelte).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]),
    );
    if (Object.keys(assegnazioni).length === 0) {
      toast.error('Nessun lotto selezionato: scegli almeno un SAL da caricare.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('assegnazioni', JSON.stringify(assegnazioni));
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean; error?: string; scritti?: Array<{ n: number; righe: number; valore: number }>; salInDb?: SalInDb[];
      };
      if (!res.ok) {
        toast.error(body.error ?? 'Import non riuscito.');
        return;
      }
      const scritti = body.scritti ?? [];
      toast.success(
        scritti.length === 0
          ? 'Nessuna riga scritta.'
          : `Caricati: ${scritti.map((s) => `SAL ${s.n} (${num(s.righe)} righe, ${eur(s.valore)})`).join(' · ')}`,
      );
      setSalInDb(body.salInDb ?? []);
      setAnteprima(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImportato?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import non riuscito.');
    } finally {
      setBusy(false);
    }
  }, [file, anteprima, scelte, onImportato]);

  const elimina = useCallback(async (n: number) => {
    const ok = await chiediConferma({
      title: `Togliere il SAL ${n} dalla banca dati?`,
      message: 'Le righe si possono sempre ricaricare dal file di ACEA.',
      confirmLabel: 'Rimuovi',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`${ENDPOINT}?n=${n}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Eliminazione non riuscita.');
        return;
      }
      toast.success(`SAL ${n} rimosso.`);
      await caricaElenco();
      onImportato?.();
    } finally {
      setBusy(false);
    }
  }, [caricaElenco, onImportato]);

  return (
    <div className="space-y-3 rounded-xl bg-[var(--brand-surface-muted)] p-3">
      <div>
        <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">Importa SAL ufficiale ACEA</h3>
        <p className="mt-0.5 text-[11px] text-[var(--brand-text-subtle)]">
          Carica l’export della cartella CONTABILITA’ così com’è. Il file contiene TUTTI i SAL emessi
          finora: qui sotto viene diviso per data di registrazione e i SAL già caricati vengono
          riconosciuti, così a entrare è solo il SAL nuovo. Il numero proposto è correggibile.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={idFile} className="sr-only">File export SAL ACEA</label>
        <input
          id={idFile}
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setAnteprima(null); }}
          className="block w-full max-w-sm cursor-pointer rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-xs text-[var(--brand-text-main)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--brand-surface-muted)] file:px-3 file:py-1 file:text-xs file:text-[var(--brand-text-main)]"
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => void analizza()} disabled={!file} loading={busy && !anteprima}>
          <Upload size={14} aria-hidden />
          Analizza
        </Button>
      </div>

      {anteprima && (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--brand-text-muted)]">
            {anteprima.file} · {num(anteprima.righeLette)} righe lette
            {anteprima.scartate > 0 && ` · ${num(anteprima.scartate)} senza Ordine, scartate`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left text-[var(--brand-text-muted)]">
                  <th className="py-1 pr-2">Registrato il</th>
                  <th className="py-1 pr-2">Lavori di</th>
                  <th className="py-1 pr-2 text-right">Righe</th>
                  <th className="py-1 pr-2 text-right">ODL</th>
                  <th className="py-1 pr-2 text-right">Valore APS</th>
                  <th className="py-1 pr-2">Carica come</th>
                </tr>
              </thead>
              <tbody>
                {anteprima.lotti.map((l) => (
                  <tr key={l.dataRegistrazione} className="border-t border-[var(--brand-border)]">
                    <td className="py-1 pr-2 font-mono tabular-nums text-[var(--brand-text-main)]">{dataIT(l.dataRegistrazione)}</td>
                    <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{meseIT(l.meseCompetenza)}</td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums">{num(l.righeTotali)}</td>
                    <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">{num(l.ordini)}</td>
                    <td className="py-1 pr-2 text-right font-mono font-medium tabular-nums">{eur(l.valore)}</td>
                    <td className="py-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[var(--brand-text-muted)]">SAL</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={scelte[l.dataRegistrazione] ?? ''}
                          placeholder="—"
                          aria-label={`Numero SAL per il lotto registrato il ${dataIT(l.dataRegistrazione)}`}
                          onChange={(e) => setScelte((s) => ({ ...s, [l.dataRegistrazione]: e.target.value }))}
                          className="w-16 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1 text-xs tabular-nums text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                        />
                        {l.giaCaricato ? (
                          <Badge variant="success">già caricato come SAL {l.salN}</Badge>
                        ) : l.righeGiaInDb > 0 ? (
                          <Badge variant="warning">{num(l.righeGiaInDb)} righe già presenti</Badge>
                        ) : (
                          <Badge variant="primary">nuovo</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--brand-text-subtle)]">
            Lascia il campo vuoto per NON toccare quel lotto. Due lotti con lo stesso numero
            finiscono nello stesso SAL — è il caso della coda che ACEA registra nei giorni dopo la
            chiusura del mese.
          </p>
          <Button type="button" variant="primary" size="sm" onClick={() => void applica()} loading={busy}>
            Carica i SAL selezionati
          </Button>
        </div>
      )}

      {salInDb.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-[var(--brand-text-muted)]">SAL in banca dati</h4>
          <ul className="mt-1 divide-y divide-[var(--brand-border)] text-xs">
            {salInDb.map((s) => (
              <li key={s.n} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-[var(--brand-text-main)]">
                  SAL {s.n}
                  <span className="ml-2 text-[var(--brand-text-muted)]">
                    lavori {dataIT(s.dal)} → {dataIT(s.al)} · {num(s.ordini)} ODL
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono font-medium tabular-nums">{eur(s.valore)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => void elimina(s.n)} disabled={busy} aria-label={`Rimuovi il SAL ${s.n}`}>
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
