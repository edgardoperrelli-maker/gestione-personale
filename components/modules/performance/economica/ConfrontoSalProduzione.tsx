'use client';
import StatTile from '@/components/ui/StatTile';
import Badge from '@/components/Badge';
import { etichettaVoce } from '@/lib/produzione/composizioneVoce';
import { eur, num, type DatiProduzione } from './tipi';

const dataIT = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

/**
 * La verifica di fine SAL: quello che ACEA ha contabilizzato contro quello che abbiamo prodotto.
 *
 * Il totale, da solo, non dice mai niente di utile — ACEA consuntiva con settimane di ritardo,
 * quindi la produzione del mese è quasi sempre più alta del SAL di quel mese. Quello che conta è
 * la tabella per voce: le voci che combaciano al centesimo dicono che il listino è tarato e che
 * gli esiti sono allineati; quelle che non combaciano sono la lista di cosa reclamare (o di cosa
 * abbiamo registrato male).
 *
 * Lo stesso vale per i quattro conteggi di ODL: separano un problema di TEMPI («l'hanno pagato,
 * ma il lavoro è di un altro mese») da un problema di DATI («l'hanno pagato e da noi non risulta
 * nemmeno»), che si risolvono in due posti diversi.
 */
export default function ConfrontoSalProduzione({ dati }: { dati: DatiProduzione }) {
  const c = dati.confrontoSal;
  if (!c) return null;

  const inCorso = c.differenza > 0;
  const voci = c.perVoce.filter((v) => v.prodConteggio > 0 || v.salConteggio > 0);
  const allineate = voci.filter((v) => Math.abs(v.delta) < 0.01).length;

  return (
    <div className="rounded-xl border border-[var(--brand-border)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">
          SAL {num(c.n)} a confronto con la produzione del periodo
        </h3>
        <span className="text-[11px] text-[var(--brand-text-subtle)]">
          lavori del SAL: {dataIT(c.salDal)} → {dataIT(c.salAl)} · periodo a schermo: {dataIT(dati.from)} → {dataIT(dati.to)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          size="sm"
          label={`SAL ${num(c.n)} (Valore APS)`}
          value={eur(c.salValoreAps)}
          note={`${num(c.salOrdini)} ODL · ${num(c.salRighe)} righe`}
        />
        <StatTile
          size="sm"
          label="Produzione ACEA nel periodo"
          value={eur(c.produzione.valore)}
          note={`${num(c.produzione.conteggio)} righe valorizzate`}
        />
        <StatTile
          size="sm"
          label="Differenza"
          value={eur(c.differenza)}
          /*
            Il segno cambia il SIGNIFICATO, non solo il colore: sopra è lavoro da farsi pagare,
            sotto è un consuntivo che noi non abbiamo. Scriverlo evita che «differenza rossa»
            venga letta come un errore in entrambi i casi.
          */
          note={inCorso ? 'prodotto e non ancora in questo SAL' : 'ACEA ha contabilizzato più di quanto risulta a noi'}
          tone={inCorso ? 'warn' : c.differenza < 0 ? 'danger' : 'ok'}
        />
        <StatTile
          size="sm"
          label="Δ listino sul SAL"
          value={eur(c.salValoreListino - c.salValoreAps)}
          note="nostre tariffe meno Valore APS ufficiale"
          tone={Math.abs(c.salValoreListino - c.salValoreAps) > 0.01 ? 'warn' : 'ok'}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Badge variant="success">{num(c.odl.inProduzione)} ODL pagati e prodotti nel periodo</Badge>
        {c.odl.fuoriPeriodo > 0 && <Badge variant="muted">{num(c.odl.fuoriPeriodo)} pagati, lavorati fuori periodo</Badge>}
        {c.odl.nonPositivi > 0 && <Badge variant="warning">{num(c.odl.nonPositivi)} pagati ma non positivi da noi</Badge>}
        {c.odl.sconosciuti > 0 && <Badge variant="danger">{num(c.odl.sconosciuti)} pagati e assenti dal database</Badge>}
        {c.odl.produzioneNonPagata > 0 && (
          <Badge variant="warning">{num(c.odl.produzioneNonPagata)} ODL prodotti e in nessun SAL</Badge>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs">
          <thead>
            <tr className="text-left text-[var(--brand-text-muted)]">
              <th className="py-1 pr-2">Attività</th>
              <th className="py-1 pr-2 text-right">Prodotte</th>
              <th className="py-1 pr-2 text-right">€ produzione</th>
              <th className="py-1 pr-2 text-right">Nel SAL</th>
              <th className="py-1 pr-2 text-right">€ SAL (APS)</th>
              <th className="py-1 pr-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {voci.map((v) => {
              const pari = Math.abs(v.delta) < 0.01;
              return (
                <tr key={v.chiave || v.label} className="border-t border-[var(--brand-border)]">
                  <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">{v.label || etichettaVoce(v.chiave) || '—'}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">{num(v.prodConteggio)}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums">{eur(v.prodValore)}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">{num(v.salConteggio)}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">{eur(v.salValore)}</td>
                  <td className={`py-1 pr-2 text-right font-mono font-medium tabular-nums ${pari ? 'text-[var(--success)]' : v.delta > 0 ? 'text-[var(--warning)]' : 'text-[var(--danger)]'}`}>
                    {pari ? '✓' : eur(v.delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-[var(--brand-text-subtle)]">
        {allineate} voci su {voci.length} combaciano al centesimo. Δ positivo = prodotto e non
        ancora contabilizzato da ACEA; Δ negativo = contabilizzato più di quanto risulta a noi.
      </p>
    </div>
  );
}
