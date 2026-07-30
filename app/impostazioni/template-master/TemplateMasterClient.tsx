'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MultiSelect from '@/components/ui/MultiSelect';

type MasterRow = {
  id: string;
  nome: string;
  committente: string;
  attivo: boolean;
  file_nome: string | null;
  gruppi_default: string[] | null;
  righe_totali: number;
  created_at: string;
};
type TassonomiaRiga = { committente: string; descrizione: string; gruppo: string; attivo: boolean };
type SnapshotInfo = { righe: number; raccolto_at: string | null } | null;
type Esito = { type: 'ok' | 'err'; msg: string } | null;

const ENDPOINT = '/api/admin/interventi/template-master';

const COMMITTENTI = [
  { value: 'acea', label: 'Acea' },
  { value: 'acqualatina', label: 'Acqua Latina' },
  { value: 'italgas', label: 'Italgas' },
  { value: 'altro', label: 'Altro' },
] as const;

export default function TemplateMasterClient() {
  const [masters, setMasters] = useState<MasterRow[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotInfo>(null);
  const [tassonomia, setTassonomia] = useState<TassonomiaRiga[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [nome, setNome] = useState('');
  const [committente, setCommittente] = useState<string>('acea');
  const [gruppiDefault, setGruppiDefault] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Esito>(null);

  // GRUPPI ATTIVITÀ dal catalogo tassonomia (mai testo libero: un refuso creerebbe un
  // gruppo-doppione), filtrati sul committente scelto. Pochi e leggibili: l'ufficio
  // ragiona per gruppo (DUNNING, LIMITAZIONI MASSIVE, …), non per dettaglio.
  const opzioniGruppi = useMemo(() => {
    const gruppi = new Set<string>();
    for (const t of tassonomia) {
      if (!t.attivo || !t.gruppo) continue;
      if (committente !== 'altro' && t.committente !== committente) continue;
      gruppi.add(t.gruppo);
    }
    return [...gruppi].sort((a, b) => a.localeCompare(b, 'it')).map((g) => ({ value: g, label: g }));
  }, [tassonomia, committente]);

  // Cambio committente: sopravvivono solo i gruppi ancora tra le opzioni.
  useEffect(() => {
    setGruppiDefault((prev) => prev.filter((v) => opzioniGruppi.some((o) => o.value === v)));
  }, [opzioniGruppi]);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/attivita-tassonomia');
      if (res.ok) setTassonomia(((await res.json()) as { righe: TassonomiaRiga[] }).righe ?? []);
    })();
  }, []);

  const carica = useCallback(async () => {
    const res = await fetch(ENDPOINT);
    if (!res.ok) {
      setEsito({ type: 'err', msg: 'Impossibile caricare la lista (DB non ancora migrato?).' });
      return;
    }
    const json = (await res.json()) as { masters: MasterRow[]; snapshot: SnapshotInfo };
    setMasters(json.masters);
    setSnapshot(json.snapshot);
  }, []);

  useEffect(() => { void carica(); }, [carica]);

  const importa = async () => {
    if (!file) return;
    setBusy(true);
    setEsito(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      if (nome.trim()) fd.append('nome', nome.trim());
      fd.append('committente', committente);
      if (gruppiDefault.length > 0) fd.append('gruppi_default', JSON.stringify(gruppiDefault));
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setEsito({ type: 'err', msg: json.error ?? 'Caricamento fallito.' });
        return;
      }
      const scartate = json.scartate > 0 ? ` (${json.scartate} righe senza ODL scartate)` : '';
      setEsito({ type: 'ok', msg: `Caricate ${json.righe} righe${scartate}. Il master è attivo: già dentro il template.` });
      setFile(null);
      setNome('');
      setGruppiDefault([]);
      await carica();
    } catch {
      setEsito({ type: 'err', msg: 'Errore di rete.' });
    } finally {
      setBusy(false);
    }
  };

  const toggla = async (m: MasterRow) => {
    setBusy(true);
    try {
      const res = await fetch(`${ENDPOINT}/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attivo: !m.attivo }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setEsito({ type: 'err', msg: json.error ?? 'Aggiornamento fallito.' });
        return;
      }
      await carica();
    } finally {
      setBusy(false);
    }
  };

  const elimina = async (m: MasterRow) => {
    if (!confirm(`Eliminare "${m.nome}" e le sue ${m.righe_totali} righe? Per toglierlo dal template senza perderlo basta spegnerlo.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${ENDPOINT}/${m.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setEsito({ type: 'err', msg: json.error ?? 'Eliminazione fallita.' });
        return;
      }
      await carica();
    } finally {
      setBusy(false);
    }
  };

  const labelCommittente = (v: string) => COMMITTENTI.find((c) => c.value === v)?.label ?? v;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <h1 className="text-lg font-bold text-[var(--brand-text-main)]">Master ODL del template</h1>
      <p className="text-sm text-[var(--brand-text-muted)]">
        I master caricati qui (limitazioni massive per comune, sostituzioni Acqua Latina, …) finiscono nel
        foglio MasterODL del template di import: l&apos;ufficio scrive l&apos;ODS/ODL e matricola, indirizzo, CAP, comune e
        descrizione attività si compilano da sole. Un ODL fuori da ogni master attivo resta rosso e si compila a mano.
      </p>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Carica un master</h2>
        <p className="mb-4 text-xs text-[var(--brand-text-muted)]">
          Excel/CSV con colonna ORDINE/ODL (obbligatoria); Matricola, Indirizzo, CAP, Località/Comune e Operazione
          si riconoscono per nome, se ci sono.
        </p>
        <label htmlFor="file-master" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
          File master
        </label>
        <input
          id="file-master"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[var(--brand-text-main)]"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Nome (facoltativo)
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={file ? file.name.replace(/\.(xlsx|xls|csv)$/i, '') : 'es. Limitazioni massive Labico'}
              className="mt-1 block w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-[var(--brand-text-main)]"
            />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Committente
            <select
              value={committente}
              onChange={(e) => setCommittente(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-[var(--brand-text-main)]"
            >
              {COMMITTENTI.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
            Gruppo attività del master (dal catalogo, facoltativo)
          </span>
          <MultiSelect
            label="Gruppo attività"
            ariaLabel="Gruppo attività del master"
            options={opzioniGruppi}
            values={gruppiDefault}
            onChange={setGruppiDefault}
            disabled={busy}
          />
          <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
            Solo gruppi del catalogo, niente testo libero. Con UN gruppo che identifica una sola attività
            (es. LIMITAZIONI MASSIVE), le righe del file senza colonna Operazione la ereditano nel template;
            un gruppo con tante attività diverse (es. DUNNING) o più gruppi insieme non decidono per riga:
            la descrizione si sceglie in Excel (tendina della Leggenda).
          </p>
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={!file || busy}
            onClick={importa}
            className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Caricamento…' : 'Carica'}
          </button>
        </div>
        {esito && (
          <p className={`mt-3 text-sm ${esito.type === 'ok' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {esito.msg}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--brand-text-main)]">Master caricati</h2>
        {masters.length === 0 ? (
          <p className="text-sm text-[var(--brand-text-muted)]">Nessun master caricato.</p>
        ) : (
          <ul className="space-y-2">
            {masters.map((m) => (
              <li key={m.id} className={`flex items-center justify-between gap-3 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-3 ${m.attivo ? '' : 'opacity-60'}`}>
                <div className="min-w-0 text-sm text-[var(--brand-text-main)]">
                  <span className="font-medium">{m.nome}</span>
                  <span className="ml-2 text-xs text-[var(--brand-text-muted)]">
                    {labelCommittente(m.committente)} · {m.righe_totali} ODL · {new Date(m.created_at).toLocaleDateString('it-IT')}
                    {m.gruppi_default?.length ? ` · gruppi: ${m.gruppi_default.join(', ')}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggla(m)}
                    aria-pressed={m.attivo}
                    title={m.attivo ? 'Spegni: esce dal template al prossimo download' : 'Accendi: rientra nel template'}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                      m.attivo
                        ? 'border-[var(--success)] text-[var(--success)]'
                        : 'border-[var(--brand-border)] text-[var(--brand-text-muted)]'
                    }`}
                  >
                    {m.attivo ? 'Attivo' : 'Spento'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => elimina(m)}
                    className="rounded-lg border border-[var(--danger)] px-2 py-1 text-xs text-[var(--danger)] transition hover:bg-[var(--danger-soft)] disabled:opacity-50"
                  >
                    Elimina
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6">
        <h2 className="mb-1 font-semibold text-[var(--brand-text-main)]">Master DUNNING (agente)</h2>
        <p className="text-xs text-[var(--brand-text-muted)]">
          Il master DUNNING/ZAGAROLO entra nel template da solo, dalla foto che l&apos;agente invia a ogni giro:
          qui non c&apos;è niente da caricare né da spegnere.
        </p>
        <p className="mt-2 text-sm text-[var(--brand-text-main)]">
          {snapshot
            ? <>ODL nella foto corrente: <span className="font-medium">{snapshot.righe}</span>{snapshot.raccolto_at ? <span className="text-xs text-[var(--brand-text-muted)]"> · aggiornata {new Date(snapshot.raccolto_at).toLocaleString('it-IT')}</span> : null}</>
            : 'Nessuna foto del master ricevuta finora.'}
        </p>
      </div>
    </div>
  );
}
