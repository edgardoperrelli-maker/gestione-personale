'use client';

import { useCallback, useState } from 'react';
import { ClipboardList, ExternalLink, LockOpen } from 'lucide-react';
import Button from '@/components/Button';
import { Card } from '@/components/Card';
import { toast } from '@/components/ui/Toast';
import { chiediConferma } from '@/components/ui/chiediConferma';
import type { EsitoOperatore, TipoEsito } from '@/lib/acea/vociRapportino';

type Risposta = {
  esiti: EsitoOperatore[];
  avvisi: string[];
  riepilogo: Record<TipoEsito, number>;
  error?: string;
};

const oggiIso = () => new Date().toLocaleDateString('sv-SE');

const ETICHETTA: Record<TipoEsito, string> = {
  creato: 'rapportino creato',
  aggiunto: 'aggiunto al rapportino del giorno',
  richiede_riapertura: 'già consegnato: serve la riapertura',
  nessuna_modifica: 'nessuna modifica',
};

const TONO: Record<TipoEsito, string> = {
  creato: 'text-[var(--success)]',
  aggiunto: 'text-[var(--success)]',
  richiede_riapertura: 'text-[var(--warning)]',
  nessuna_modifica: 'text-[var(--brand-text-muted)]',
};

/**
 * Generazione dei rapportini della commessa per un giorno.
 *
 * Vale la regola «un rapportino per operatore per giorno»: se l'operatore ha già un rapportino —
 * tipicamente quello Italgas, pianificato a mano prima — gli interventi ACEA gli si aggiungono
 * dentro, evidenziati come nuovi. Non se ne crea un secondo.
 *
 * Il pulsante si può premere quante volte si vuole: le voci sono agganciate al loro intervento e
 * un secondo giro non duplica niente. È quello che serve per le attivazioni, che arrivano durante
 * la giornata su rapportini già generati.
 */
export default function RapportiniGiorno() {
  const [data, setData] = useState(oggiIso);
  const [busy, setBusy] = useState(false);
  const [risposta, setRisposta] = useState<Risposta | null>(null);

  const genera = useCallback(async (confermaRiaperture: boolean) => {
    setBusy(true);
    try {
      const res = await fetch('/api/acea/rapportini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, confermaRiaperture }),
      });
      const body = (await res.json()) as Risposta;
      if (!res.ok) {
        toast.error(body.error ?? 'Generazione non riuscita.');
        return;
      }
      setRisposta(body);
      const { creato, aggiunto, richiede_riapertura: daRiaprire } = body.riepilogo;
      if (body.esiti.length === 0) {
        toast.info('Nessun intervento ACEA pianificato per questo giorno.');
      } else {
        const parti = [
          creato > 0 ? `${creato} creati` : '',
          aggiunto > 0 ? `${aggiunto} aggiornati` : '',
          daRiaprire > 0 ? `${daRiaprire} da riaprire` : '',
        ].filter(Boolean);
        toast.success(parti.join(' · ') || 'Nessuna modifica: era già tutto a posto');
      }
      for (const a of body.avvisi) toast.info(a);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }, [data]);

  const riapri = useCallback(async () => {
    const n = risposta?.riepilogo.richiede_riapertura ?? 0;
    const ok = await chiediConferma({
      title: n === 1 ? 'Riaprire 1 rapportino già consegnato?' : `Riaprire ${n} rapportini già consegnati?`,
      message:
        'Torneranno compilabili per 48 ore e gli operatori vedranno gli interventi aggiunti. '
        + 'Quanto già compilato resta com’è.',
      confirmLabel: 'Riapri e aggiungi',
    });
    if (ok) await genera(true);
  }, [genera, risposta]);

  const daRiaprire = risposta?.riepilogo.richiede_riapertura ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardList size={18} className="text-[var(--brand-text-muted)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--brand-text-main)]">
          Rapportini del giorno
        </h2>
        <input
          type="date"
          value={data}
          onChange={(e) => { setData(e.target.value); setRisposta(null); }}
          aria-label="Giorno dei rapportini"
          className="ml-auto h-9 rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm text-[var(--brand-text-main)]"
        />
        <Button variant="primary" size="sm" onClick={() => void genera(false)} loading={busy}>
          Genera
        </Button>
      </div>

      <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
        Un rapportino per operatore per giorno: se ne esiste già uno — anche di un&apos;altra
        commessa — gli interventi ACEA gli si aggiungono dentro. Rilanciarlo non duplica nulla.
      </p>

      {risposta && risposta.esiti.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--brand-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--brand-surface-muted)] text-xs text-[var(--brand-text-muted)]">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Operatore</th>
                <th className="px-3 py-2 text-right font-semibold">Interventi</th>
                <th className="px-3 py-2 text-right font-semibold">Voci aggiunte</th>
                <th className="px-3 py-2 text-left font-semibold">Esito</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {risposta.esiti.map((e) => (
                <tr key={e.staff_id} className="border-t border-[var(--brand-border)]">
                  <td className="px-3 py-2 text-[var(--brand-text-main)]">
                    {e.staff_name ?? e.staff_id}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">
                    {e.interventi}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--brand-text-main)]">
                    {e.voci_aggiunte}
                  </td>
                  <td className={`px-3 py-2 ${TONO[e.esito]}`}>{ETICHETTA[e.esito]}</td>
                  <td className="px-3 py-2 text-right">
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--brand-primary)] hover:underline"
                      >
                        apri
                        <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {daRiaprire > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--brand-surface-muted)] px-3 py-2">
          <span className="text-xs text-[var(--brand-text-main)]">
            {daRiaprire === 1
              ? '1 operatore ha già consegnato il rapportino: gli interventi nuovi non sono stati aggiunti.'
              : `${daRiaprire} operatori hanno già consegnato il rapportino: gli interventi nuovi non sono stati aggiunti.`}
          </span>
          <Button variant="outline" size="sm" onClick={() => void riapri()} loading={busy} className="ml-auto">
            <LockOpen size={14} aria-hidden="true" />
            Riapri e aggiungi
          </Button>
        </div>
      )}
    </Card>
  );
}
