'use client';
/* Hallmark · redesign KPI (economica) · genre: modern-minimal · design-system: DESIGN.md ("Cockpit") · designed-as-app */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import Tabs from '@/components/Tabs';
import { ArrowRight } from 'lucide-react';
import type { Aggregato } from '@/lib/produzione/aggregaProduzione';
import type { ClasseDiscrepanza } from '@/lib/produzione/riconciliazione';
import { ETICHETTA_VISTA, VISTE, type VistaCommittente } from '@/lib/produzione/committente';
import { etichettaVoce } from '@/lib/produzione/composizioneVoce';
import EditorListinoAcea from './EditorListinoAcea';
import KpiDirezione from './economica/KpiDirezione';
import TrendProduzioneSal from './economica/TrendProduzioneSal';
import SalStorico from './economica/SalStorico';
import ComposizioneProduzione from './economica/ComposizioneProduzione';
import PersonaleImpegno from './economica/PersonaleImpegno';
import EsitiOperatore from './economica/EsitiOperatore';
import CandeleSettimanali from './economica/CandeleSettimanali';
import { eur, num, type DatiProduzione } from './economica/tipi';

/*
  La colonna di mezzo dell'audit è il REGISTRO del modulo ACEA da luglio 2026 (il motore ha
  smesso di leggere i file master su SharePoint), ma queste etichette dicevano ancora «master»:
  chi leggeva «nel DB ma non nel master» andava a cercare in un file che il conto non l'ha fatto.
*/
const AUDIT_LABEL: Record<ClasseDiscrepanza, string> = {
  SOLO_PORTALE: 'Solo nel portale ACEA (assente da DB e registro)',
  DB_NON_IN_REGISTRO: 'Nel DB ma non nel registro ordini',
  REGISTRO_NON_IN_DB: 'Nel registro ordini ma non nel DB',
  POSITIVO_DB_NON_COMPLETATO_PORTALE: 'Positivo nel DB ma non consuntivato sul portale (Produzione > SAL)',
  COMPLETATO_PORTALE_NON_POSITIVO_DB: 'Consuntivato sul portale ma non positivo nel DB',
  VOCE_DISCORDE: 'Voce DB ≠ voce del registro',
  VOCE_NON_RISOLTA: 'Voce non derivabile dall’attività',
};
const ORDINE_AUDIT: ClasseDiscrepanza[] = [
  'POSITIVO_DB_NON_COMPLETATO_PORTALE',
  'COMPLETATO_PORTALE_NON_POSITIVO_DB',
  'DB_NON_IN_REGISTRO',
  'REGISTRO_NON_IN_DB',
  'SOLO_PORTALE',
  'VOCE_DISCORDE',
  'VOCE_NON_RISOLTA',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// `py-1.5` e non `py-1`: i campi stanno in fila con i preset, che sono `Button size="sm"` da
// 30px. Con `py-1` rendevano 26 — 4+16+2 di bordo — e la riga aveva due altezze.
const field =
  'rounded-[var(--radius-md)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1.5 text-xs text-[var(--brand-text-main)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]';

export default function PerformanceEconomica() {
  const now = useMemo(() => new Date(), []);
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // Default = ultimi 30 giorni (così non è vuoto il 1° del mese, quando il "mese corrente" non ha dati).
  const trentaGiorniFa = useMemo(() => {
    const d = new Date(now);
    d.setDate(now.getDate() - 30);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, [now]);

  const [from, setFrom] = useState(trentaGiorniFa);
  const [to, setTo] = useState(today);
  /*
    Apre su «Tutti»: è il totale vero delle commesse. Aprire su ACEA — com'era la pagina finché
    ACEA era l'unica — mostrerebbe un numero parziale con l'aria di essere il totale, e chi non
    sa che esiste un filtro non ha modo di accorgersene.
  */
  const [vista, setVista] = useState<VistaCommittente>('tutti');
  const [dati, setDati] = useState<DatiProduzione | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/admin/acea/produzione?from=${from}&to=${to}&committente=${vista}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setDati((await res.json()) as DatiProduzione);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore caricamento.');
      setDati(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, vista]);

  useEffect(() => {
    void carica();
  }, [carica]);

  const setRange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };
  const presetMese = () => setRange(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, today);
  const presetTrimestre = () => setRange(`${now.getFullYear()}-${pad(now.getMonth() - (now.getMonth() % 3) + 1)}-01`, today);
  const presetAnno = () => setRange(`${now.getFullYear()}-01-01`, today);

  // "Allinea da ACEA": comanda l'agente a rileggere i master. DUNNING (limitazioni con ordine) oppure
  // TUTTI i comuni delle limitazioni massive (Labico + Zagarolo, e ogni comune futuro). L'agente esegue
  // al prossimo giro (stesso flag di "Richiedi stato ACEA"); poi ricarica la foglietta per vedere i dati.
  const [allineaMsg, setAllineaMsg] = useState<string | null>(null);
  const allinea = async (target: 'dunning' | 'TUTTI') => {
    setAllineaMsg('Invio richiesta…');
    try {
      const res = await fetch('/api/admin/agente/acea-stato', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setAllineaMsg(
        target === 'TUTTI'
          ? 'Richiesto: l’agente allineerà i master delle limitazioni massive (tutti i comuni) al prossimo giro.'
          : 'Richiesto: l’agente leggerà il master DUNNING al prossimo giro.',
      );
    } catch (e) {
      setAllineaMsg(e instanceof Error ? e.message : 'Errore richiesta allineamento.');
    }
  };

  const exportUrl = `/api/admin/acea/produzione/export?from=${from}&to=${to}&committente=${vista}`;
  const invalid = Boolean(from && to && from > to);

  const auditClassi = dati ? ORDINE_AUDIT.filter((c) => dati.auditSummary[c] > 0) : [];
  // La pagina si fida del payload, non del proprio stato: fra un clic sulla scheda e la risposta
  // il `vista` locale è già cambiato mentre i numeri a schermo sono ancora quelli di prima.
  const conSal = dati?.conContabilizzazione ?? true;

  return (
    <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--brand-text-main)]">Produzione economica</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Master e listino sono roba ACEA: nella vista AcquaLatina sparirebbero comandi che lì
              non hanno un effetto. */}
          {vista !== 'acqualatina' && (
            <>
              <span className="text-[11px] text-[var(--brand-text-subtle)]">Allinea master:</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => allinea('dunning')}>Dunning</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => allinea('TUTTI')}>Limitazioni massive</Button>
              <span className="mx-1 h-4 w-px bg-[var(--brand-border)]" aria-hidden />
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen((v) => !v)}>
                {editorOpen ? 'Chiudi listino' : 'Listino tariffe ACEA'}
              </Button>
            </>
          )}
          <a
            href={invalid ? undefined : exportUrl}
            /*
              Sono `<a>` (scaricano un file), quindi non passano dal primitivo: le classi ne
              ricalcano la taglia `sm`. `py-1.5` + `border` al posto di `h-7`, che li teneva a
              28px contro i 30 dei Button in fila. Il bordo qui e` trasparente per la stessa
              ragione per cui ce l'ha `Button variant="primary"`: l'altezza nasce anche dal
              bordo, e senza la scatola non combacia.
            */
            className={`inline-flex items-center rounded-[var(--radius-md)] border border-transparent bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-[var(--on-primary)] transition hover:bg-[var(--brand-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-surface)] ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Scarica Excel (dashboard)
          </a>
          <a
            href={invalid ? undefined : `/presentazione/produzione-acea?from=${from}&to=${to}&committente=${vista}`}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center rounded-[var(--radius-md)] border border-[var(--brand-primary)] px-3 py-1.5 text-xs font-medium text-[var(--brand-primary)] transition hover:bg-[var(--brand-primary-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--brand-surface)] ${invalid ? 'pointer-events-none opacity-50' : ''}`}
          >
            Presentazione
          </a>
        </div>
      </div>
      {allineaMsg && <p className="mb-2 text-xs text-[var(--brand-text-muted)]">{allineaMsg}</p>}

      {editorOpen && vista !== 'acqualatina' && (
        <div className="mb-4 rounded-xl bg-[var(--brand-surface-muted)] p-3">
          <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">Listino tariffe ACEA per voce (con validità)</h3>
          {/* Dice ACEA perché mostra solo ACEA: la tariffa AcquaLatina esiste ed è in uso nei conti
              qui sopra, ma questo editor non la vede ancora — senza l'avviso sembrerebbe mancante. */}
          <p className="mb-2 text-[11px] text-[var(--brand-text-subtle)]">
            Le tariffe AcquaLatina sono già attive nei conti ma non compaiono in questo editor.
          </p>
          <EditorListinoAcea onSaved={carica} />
        </div>
      )}

      {/*
        Filtro di dato e non vista di modulo: stessa pagina, stesso dataset, tre tagli — quindi
        `Tabs` in pagina e non fogliette con route dedicate (DESIGN.md §7bis). Trasformarlo in
        pagine costringerebbe a un giro completo per confrontare due commesse.

        Sta SOPRA la barra del periodo perché comanda più cose: il periodo ritaglia i numeri,
        il committente decide di CHI sono.
      */}
      <Tabs
        className="mb-3"
        value={vista}
        onValueChange={(v) => setVista(v as VistaCommittente)}
        items={VISTE.map((v) => ({ value: v, label: ETICHETTA_VISTA[v] }))}
      />

      {/* Barra periodo */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-[var(--brand-surface-muted)] px-3 py-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} aria-label="Da" />
        <ArrowRight size={13} className="shrink-0 text-[var(--brand-text-subtle)]" aria-hidden />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} aria-label="A" />
        <Button type="button" variant="ghost" size="sm" onClick={presetMese}>Mese</Button>
        <Button type="button" variant="ghost" size="sm" onClick={presetTrimestre}>Trim.</Button>
        <Button type="button" variant="ghost" size="sm" onClick={presetAnno}>Anno</Button>
        {invalid && <span className="text-xs text-[var(--danger)]">Da &gt; A</span>}
        {loading && <span className="text-xs text-[var(--brand-text-subtle)]">Carico…</span>}
      </div>

      {errore && <p className="text-sm text-[var(--danger)]">{errore}</p>}

      {dati && (
        <>
          <KpiDirezione dati={dati} operative />

          {/* Trend cumulato Produzione vs SAL */}
          <div className="mb-4">
            <TrendProduzioneSal dati={dati} />
          </div>

          {/* Lo storico dei SAL è il file ufficiale ACEA: nella vista AcquaLatina non esiste. */}
          {conSal && (
            <div className="mb-4">
              <SalStorico dati={dati} />
            </div>
          )}

          {/* Composizione: donut per voce + top attività */}
          <div className="mb-4">
            <ComposizioneProduzione dati={dati} />
          </div>

          {/* Personale impegnato */}
          <div className="mb-4">
            <PersonaleImpegno dati={dati} />
          </div>

          {/* Esiti sull'assegnato per operatore */}
          <div className="mb-4">
            <EsitiOperatore dati={dati} />
          </div>

          {/* Candele settimanali per operatore (settimana navigabile, filtro indipendente dal periodo di pagina) */}
          <div className="mb-4">
            <CandeleSettimanali vista={vista} />
          </div>

          {/* Produzione vs SAL per voce (tabella operativa) */}
          <div className="mb-4 rounded-xl bg-[var(--brand-surface-muted)] p-3">
            <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">
              {conSal ? 'Produzione vs Esitato ACEA per voce' : 'Produzione per voce'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--brand-text-muted)]">
                    <th className="py-1 pr-2">Voce</th>
                    <th className="py-1 pr-2 text-right">Produzione</th>
                    {/* Senza portale la colonna sarebbe una colonna di zeri: si toglie, non si azzera. */}
                    {conSal && <th className="py-1 pr-2 text-right">Esitato ACEA</th>}
                  </tr>
                </thead>
                <tbody>
                  {dati.produzione.perVoce.map((v) => {
                    const sal = dati.sal.perVoce.find((s) => s.chiave === v.chiave);
                    return (
                      <tr key={v.chiave} className="border-t border-[var(--brand-border)]">
                        {/* `etichettaVoce` e non `v.chiave`: la chiave delle commesse senza voce è
                            tecnica («COMMESSA:acqualatina») e non va mai a schermo. */}
                        <td className="py-1 pr-2 font-medium text-[var(--brand-text-main)]">{etichettaVoce(v.chiave)}</td>
                        <td className="py-1 pr-2 text-right font-mono tabular-nums">{eur(v.valore)}</td>
                        {conSal && (
                          <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">{eur(sal?.valore ?? 0)}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per attività (dettaglio granulare del listino) */}
          <div className="mb-4">
            <TabellaAgg titolo="Produzione per attività" righe={dati.produzione.perAttivita} max={30} />
          </div>

          {/*
            Il taglio per commessa compare solo quando ce n'è più di una sotto lo stesso totale:
            è la domanda che si fa chi guarda «Tutti» — quanto di questo è ACEA e quanto no.
            Nelle viste singole sarebbe una tabella con una riga sola uguale al totale.
          */}
          {dati.produzione.perCommessa.length > 1 && (
            <div className="mb-4">
              <TabellaAgg titolo="Per committente" righe={dati.produzione.perCommessa} />
            </div>
          )}

          {/* Per operatore / territorio */}
          <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TabellaAgg titolo="Per operatore" righe={dati.produzione.perOperatore} />
            <TabellaAgg titolo="Per territorio" righe={dati.produzione.perTerritorio} />
          </div>

          {/*
            Audit a tre vie: solo dove le tre vie esistono. Su AcquaLatina il registro ordini ACEA
            e il portale SAP non c'entrano nulla, e un pannello «nessuna discrepanza» lì darebbe
            una rassicurazione che nessuno ha verificato.
          */}
          {conSal && (
          <div className="rounded-xl bg-[var(--brand-surface-muted)] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="text-[13px] font-medium text-[var(--brand-text-main)]">
                Audit a tre vie (DB · registro ordini · portale){dati.vista === 'tutti' ? ' — solo ACEA' : ''}
              </h3>
              {(!dati.registroPopolato || !dati.portalePopolato) && (
                <Badge variant="warn">
                  {!dati.registroPopolato && !dati.portalePopolato
                    ? 'Registro ordini e snapshot portale non ancora popolati'
                    : !dati.registroPopolato
                      ? 'Registro ordini vuoto'
                      : 'Snapshot portale non popolato'}
                </Badge>
              )}
              {dati.registroPopolato && dati.portalePopolato && auditClassi.length === 0 && (
                <Badge variant="success">Nessuna discrepanza</Badge>
              )}
              {auditClassi.map((c) => (
                <Badge key={c} variant="warning">{AUDIT_LABEL[c]}: {num(dati.auditSummary[c])}</Badge>
              ))}
            </div>
            {(!dati.registroPopolato || !dati.portalePopolato) && (
              <p className="mb-2 text-xs text-[var(--brand-text-muted)]">
                L’audit DB↔registro↔portale è limitato finché mancano le due colonne di riscontro. Il
                registro ordini si popola con l’import del Cruscotto nel modulo ACEA; lo snapshot del
                portale con il giro «Richiedi stato ACEA» dell’agente. Poi ricarica.
              </p>
            )}
            {dati.audit.length > 0 && (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[var(--brand-surface)]">
                    <tr className="text-left text-[var(--brand-text-muted)]">
                      <th className="py-1 pr-2">ODL</th>
                      <th className="py-1 pr-2">Discrepanza</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dati.audit.map((d, i) => (
                      <tr key={`${d.odl}-${d.classe}-${i}`} className="border-t border-[var(--brand-border)]">
                        <td className="py-1 pr-2 font-mono text-[var(--brand-text-main)]">{d.odl}</td>
                        <td className="py-1 pr-2 text-[var(--brand-text-muted)]">{AUDIT_LABEL[d.classe]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dati.auditTruncated && (
                  <p className="mt-1 text-[11px] text-[var(--brand-text-subtle)]">Elenco troncato: mostrate {num(dati.audit.length)} di {num(dati.auditTotale)} discrepanze.</p>
                )}
              </div>
            )}
          </div>
          )}
        </>
      )}
    </section>
  );
}

function TabellaAgg({ titolo, righe, max = 12 }: { titolo: string; righe: Aggregato[]; max?: number }) {
  const top = righe.slice(0, max);
  return (
    <div className="rounded-xl bg-[var(--brand-surface-muted)] p-3">
      <h3 className="mb-2 text-[13px] font-medium text-[var(--brand-text-main)]">{titolo}</h3>
      {top.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--brand-text-muted)]">Nessun dato.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {top.map((r) => (
                <tr key={r.chiave} className="border-t border-[var(--brand-border)] first:border-t-0">
                  <td className="py-1 pr-2 text-[var(--brand-text-main)]">{r.label}</td>
                  <td className="py-1 pr-2 text-right font-mono tabular-nums text-[var(--brand-text-muted)]">{r.conteggio.toLocaleString('it-IT')}</td>
                  <td className="py-1 pr-2 text-right font-mono font-medium tabular-nums">{r.valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
