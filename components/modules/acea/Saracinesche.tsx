'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Waves } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import Tabs from '@/components/Tabs';
import StatTile from '@/components/ui/StatTile';
import { dataIt } from '@/lib/acea/colonneTabella';
import type { DichiarazioneClassificata, Famiglia, OrdineAperto } from '@/lib/acea/saracinesche';

type Risposta = {
  fatte: number;
  coperte: number;
  daRichiedere: number;
  daEsitare: number;
  valoreDaRichiedere: number;
  ordiniSostituzioneNelRegistro: number;
  /** false quando il registro non ha ordini di sostituzione: la copertura non è calcolabile. */
  attendibile: boolean;
  dichiarazioni: DichiarazioneClassificata[];
  ordiniAperti: OrdineAperto[];
  error?: string;
};

type Vista = 'da_richiedere' | 'da_esitare' | 'fatte';

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/**
 * Le due righe si distinguono per `numero_operazione`, non per `stato`: quello ce l'hanno
 * entrambe, con significati diversi (lo stato della dichiarazione, lo stato ACEA dell'ordine).
 */
const isOrdine = (r: DichiarazioneClassificata | OrdineAperto): r is OrdineAperto =>
  'numero_operazione' in r;

/**
 * Ciclo saracinesche: fatte · da esitare · da richiedere.
 *
 * Tutto derivato, nessuna tabella nuova. La regola è che dove risulta una saracinesca sostituita
 * deve esistere un ordine ACEA che la registri: se l'ordine non c'è, quel lavoro non verrà mai
 * pagato. Per questo «da richiedere» porta accanto la cifra — è l'unico numero che fa muovere.
 *
 * Oggi il collegamento fra la saracinesca e il suo ordine vive in una colonna del master compilata
 * a mano. Qui si deriva dall'impianto e dalla matricola.
 */
export default function Saracinesche({ famiglia }: { famiglia: Famiglia }) {
  const [dati, setDati] = useState<Risposta | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('da_richiedere');

  const carica = useCallback(async () => {
    setCaricando(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/acea/saracinesche?famiglia=${famiglia}`);
      const body = (await res.json()) as Risposta;
      if (!res.ok) {
        setErrore(body.error ?? 'Lettura non riuscita.');
        return;
      }
      setDati(body);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Lettura non riuscita.');
    } finally {
      setCaricando(false);
    }
  }, [famiglia]);

  useEffect(() => { void carica(); }, [carica]);

  const righe = useMemo(() => {
    if (!dati) return [];
    if (vista === 'da_esitare') return dati.ordiniAperti;
    return dati.dichiarazioni.filter((d) =>
      vista === 'da_richiedere' ? d.stato === 'da_richiedere' : true,
    );
  }, [dati, vista]);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Waves size={18} className="text-[var(--brand-text-muted)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">Saracinesche</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void carica()}
          loading={caricando}
          className="ml-auto"
          aria-label="Ricalcola"
        >
          <RefreshCw size={14} aria-hidden="true" />
          Ricalcola
        </Button>
      </div>

      {errore && (
        <p className="mt-2 text-sm text-[var(--danger)]">{errore}</p>
      )}

      {dati && (
        <>
          {!dati.attendibile && (
            <p className="mt-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--brand-text-main)]">
              Nel registro non c&apos;è ancora nessun ordine di sostituzione saracinesca: la
              copertura non è calcolabile e «da richiedere» coincide con «fatte». Carica un export
              ACEA prima di usare questi numeri.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Fatte" value={dati.fatte} note="dichiarate nei rapportini" />
            <StatTile
              label="Da esitare"
              value={dati.daEsitare}
              note="ordini aperti su ACEA"
              tone={dati.daEsitare > 0 ? 'warn' : 'neutral'}
            />
            <StatTile
              label="Da richiedere"
              value={dati.attendibile ? dati.daRichiedere : '—'}
              note={dati.attendibile ? "nessun ordine sull'impianto" : 'serve un import'}
              tone={dati.attendibile && dati.daRichiedere > 0 ? 'danger' : 'neutral'}
            />
            <StatTile
              label="Valore a rischio"
              value={dati.attendibile ? euro(dati.valoreDaRichiedere) : '—'}
              note="91,12 € l'una"
              tone={dati.attendibile && dati.daRichiedere > 0 ? 'danger' : 'neutral'}
            />
          </div>

          {/* `Tabs` del sistema e non tre bottoni disegnati a mano: e` un filtro sullo stesso
              dataset, esattamente il caso di DESIGN.md §7bis. */}
          <div className="mt-3">
            <Tabs
              value={vista}
              onValueChange={(v) => setVista(v as Vista)}
              items={[
                { value: 'da_richiedere', label: `Da richiedere ${dati.daRichiedere}` },
                { value: 'da_esitare', label: `Da esitare ${dati.daEsitare}` },
                { value: 'fatte', label: `Tutte le fatte ${dati.fatte}` },
              ]}
            />
          </div>

          <div className="mt-2 max-h-80 overflow-auto rounded-[var(--radius-md)] border border-[var(--brand-border)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--brand-surface-muted)] text-xs text-[var(--brand-text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    {vista === 'da_esitare' ? 'ODL sostituzione' : 'ODL intervento'}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Impianto</th>
                  <th className="px-3 py-2 text-left font-semibold">Matricola</th>
                  <th className="px-3 py-2 text-left font-semibold">Comune</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    {vista === 'da_esitare' ? 'Creato il' : 'Eseguita il'}
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    {vista === 'da_esitare' ? 'Stato' : 'Operatore'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {righe.map((r) => {
                  const ordine = isOrdine(r);
                  return (
                    <tr
                      key={ordine ? `${r.odl}|${r.numero_operazione}` : `${r.odl}|${r.impianto ?? r.matricola}`}
                      className="border-t border-[var(--brand-border)]"
                    >
                      <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--brand-text-main)]">
                        {r.odl}
                      </td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--brand-text-muted)]">
                        {r.impianto ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--brand-text-muted)]">
                        {r.matricola ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--brand-text-muted)]">{r.comune ?? '—'}</td>
                      <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--brand-text-muted)]">
                        {dataIt(ordine ? r.data_creazione : r.data)}
                      </td>
                      <td className="px-3 py-1.5 text-[var(--brand-text-muted)]">
                        {ordine ? r.stato : (r.operatore ?? '—')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {righe.length === 0 && !caricando && (
              <p className="px-4 py-6 text-center text-sm text-[var(--brand-text-muted)]">
                {vista === 'da_richiedere' && dati.attendibile
                  ? 'Nessuna saracinesca da richiedere: ogni lavoro dichiarato ha il suo ordine.'
                  : 'Nessuna riga.'}
              </p>
            )}
          </div>

          <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
            L&apos;aggancio è per impianto, e per matricola quando l&apos;impianto non si conosce.
            «Fatte» conta i misuratori, non le voci: la stessa saracinesca si paga una volta sola.
            «Da esitare» conta gli ordini aperti su ACEA, che sono un insieme diverso — i tre numeri
            non si sommano.
          </p>
        </>
      )}
    </Card>
  );
}
