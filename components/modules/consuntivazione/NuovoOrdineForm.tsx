'use client';

import { useMemo, useState } from 'react';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/Button';
import SquadraPicker from './SquadraPicker';
import AzioniForm from './AzioniForm';
import { risolviFlussoPerGruppo, templateCollegato } from '@/lib/rapportini/flussiGruppo';
import { committenteEquivalente } from '@/lib/attivita/tassonomia';
import { esitabileConsuntivo } from '@/lib/consuntivazione/statoEsito';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';
import type { Bootstrap } from './ConsuntivazioneClient';

const oggi = () => new Date().toISOString().slice(0, 10);

type Anagrafica = {
  odl: string; pdr: string; matricola: string; nominativo: string;
  via: string; comune: string; cap: string; fascia_oraria: string;
};
const ANAG_VUOTA: Anagrafica = { odl: '', pdr: '', matricola: '', nominativo: '', via: '', comune: '', cap: '', fascia_oraria: '' };

const CAMPI_ANAG: Array<{ k: keyof Anagrafica; label: string; wide?: boolean }> = [
  { k: 'odl', label: 'ODL' },
  { k: 'pdr', label: 'PDR' },
  { k: 'matricola', label: 'Matricola' },
  { k: 'nominativo', label: 'Nominativo', wide: true },
  { k: 'via', label: 'Indirizzo', wide: true },
  { k: 'comune', label: 'Comune' },
  { k: 'cap', label: 'CAP' },
  { k: 'fascia_oraria', label: 'Fascia oraria' },
];

export default function NuovoOrdineForm({ boot, onDone }: { boot: Bootstrap; onDone: (msg: string) => void }) {
  const [rapId] = useState(() => crypto.randomUUID());
  const [committente, setCommittente] = useState('');
  const [attivita, setAttivita] = useState('');
  const [anag, setAnag] = useState<Anagrafica>(ANAG_VUOTA);
  const [dataEsecuzione, setDataEsecuzione] = useState(oggi);
  const [territorioId, setTerritorioId] = useState('');
  const [esecutori, setEsecutori] = useState<string[]>([]);
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const attivitaDelCommittente = useMemo(
    () => boot.attivita.filter((a) => a.committente === committente),
    [boot.attivita, committente],
  );

  const campi: TemplateCampo[] = useMemo(() => {
    if (!committente || !attivita) return [];
    const gruppo = attivitaDelCommittente.find((a) => a.descrizione === attivita)?.gruppo ?? null;
    const collegati = boot.flussi.filter((f) => templateCollegato(f));
    const flusso = risolviFlussoPerGruppo(committenteEquivalente(committente), gruppo, collegati);
    const c = flusso?.campi && flusso.campi.length > 0 ? flusso.campi : boot.fallbackCampi;
    return (c ?? []) as TemplateCampo[];
  }, [committente, attivita, attivitaDelCommittente, boot.flussi, boot.fallbackCampi]);

  const esitabile = campi.length > 0 && esitabileConsuntivo(risposte, campi);
  const pronto = Boolean(committente && attivita && esecutori.length > 0 && dataEsecuzione && esitabile);

  const resetAll = () => {
    setCommittente(''); setAttivita(''); setAnag(ANAG_VUOTA); setDataEsecuzione(oggi());
    setTerritorioId(''); setEsecutori([]); setRisposte({});
  };

  async function submit() {
    setSalvando(true); setErrore(null);
    try {
      const res = await fetch('/api/admin/consuntivazione/nuovo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rapId,
          committente,
          anagrafica: { ...anag, attivita },
          risposte,
          esecutori: esecutori.map((staff_id) => ({ staff_id })),
          dataEsecuzione,
          territorioId: territorioId || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErrore(j.messaggio || j.dettaglio || messaggioErrore(j.error) || 'Errore imprevisto.'); return; }
      resetAll();
      onDone(j.annullato ? 'Ordine registrato come doppio positivo (annullato e messo in riconciliazione).' : 'Ordine consuntivato con successo.');
    } catch {
      setErrore('Errore di rete. Riprova.');
    } finally {
      setSalvando(false);
    }
  }

  const field = 'block';
  const labelCls = 'mb-1 block text-xs font-medium text-[var(--brand-text-muted)]';

  return (
    <div className="space-y-6">
      {/* Anagrafica ordine */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-[var(--brand-text-main)]">Dati ordine</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={field}>
            <label className={labelCls}>Committente</label>
            <Select value={committente} onChange={(e) => { setCommittente(e.target.value); setAttivita(''); setRisposte({}); }}>
              <option value="">— Seleziona —</option>
              {boot.committenti.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div className={field}>
            <label className={labelCls}>Attività</label>
            <Select value={attivita} disabled={!committente} onChange={(e) => { setAttivita(e.target.value); setRisposte({}); }} error={Boolean(committente && !attivita)}>
              <option value="">— Seleziona —</option>
              {attivitaDelCommittente.map((a) => <option key={a.descrizione} value={a.descrizione}>{a.descrizione}</option>)}
            </Select>
          </div>
          {CAMPI_ANAG.map(({ k, label, wide }) => (
            <div key={k} className={wide ? 'sm:col-span-2' : field}>
              <label className={labelCls}>{label}</label>
              <Input value={anag[k]} onChange={(e) => setAnag((a) => ({ ...a, [k]: e.target.value }))} />
            </div>
          ))}
          <div className={field}>
            <label className={labelCls}>Data esecuzione</label>
            <Input type="date" value={dataEsecuzione} onChange={(e) => setDataEsecuzione(e.target.value)} />
          </div>
          <div className={field}>
            <label className={labelCls}>Territorio</label>
            <Select value={territorioId} onChange={(e) => setTerritorioId(e.target.value)}>
              <option value="">— Nessuno —</option>
              {boot.territori.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </div>
        </div>
      </section>

      {/* Squadra */}
      <SquadraPicker operatori={boot.operatori} valori={esecutori} onChange={setEsecutori} disabilitato={salvando} />

      {/* Azioni del flusso */}
      {campi.length > 0 ? (
        <AzioniForm campi={campi} risposte={risposte} onChange={setRisposte} rapId={rapId} disabilitato={salvando} />
      ) : committente && attivita ? (
        <p className="text-sm text-[var(--status-warn)]">Nessun flusso attivo per questa attività: impossibile esitare.</p>
      ) : (
        <p className="text-sm text-[var(--brand-text-subtle)]">Seleziona committente e attività per compilare le azioni.</p>
      )}

      {errore && <p className="text-sm text-[var(--status-ko)]">{errore}</p>}

      <div className="flex items-center justify-end gap-3 border-t border-[var(--brand-border)] pt-4">
        <Button variant="ghost" onClick={resetAll} disabled={salvando}>Azzera</Button>
        <Button variant="primary" onClick={submit} loading={salvando} disabled={!pronto}>
          {salvando ? 'Esitazione…' : 'Esita ordine'}
        </Button>
      </div>
    </div>
  );
}

function messaggioErrore(code: string | undefined): string | null {
  switch (code) {
    case 'attivita_sconosciuta': return "L'attività non è nella tassonomia: correggila.";
    case 'attivita_obbligatoria': return "Indica l'attività.";
    case 'esecutori_mancanti': return 'Seleziona almeno un operatore.';
    case 'foto_mancanti': return 'Mancano delle foto obbligatorie.';
    case 'nessun_flusso': return 'Nessun flusso attivo per il gruppo attività.';
    case 'esito_mancante': return 'Seleziona un esito (positivo o negativo) per esitare.';
    case 'nota_negativo': return "Per l'esito negativo inserisci la nota col motivo.";
    case 'data_non_valida': return 'Data esecuzione non valida.';
    case 'committente_non_valido': return 'Committente non valido.';
    default: return null;
  }
}
