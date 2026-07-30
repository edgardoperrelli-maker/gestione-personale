'use client';

import { useEffect, useState } from 'react';

export type ManualTaskData = {
  committente: string;
  territorio: string;
  indirizzo: string;
  cap: string;
  citta: string;
  odl: string;
  pdr: string;
  matricola: string;
  attivita: string;
  fascia_oraria: string;
  nominativo: string;
  staffId: string;
  note: string;
};

export default function ManualTaskModal({
  operators,
  committenti,
  territori,
  righeTassonomia,
  defaultCommittente,
  defaultTerritorio,
  onClose,
  onAdd,
}: {
  operators: { id: string; displayName: string }[];
  /** Committenti dal REGISTRO (`committenti`), mai cablati: {codice runtime, nome}. */
  committenti: { value: string; label: string }[];
  /** Nomi dei territori master (`territories`). */
  territori: string[];
  /** Tassonomia attiva per i suggerimenti attività del committente scelto (null = non caricata). */
  righeTassonomia: { committente: string; descrizione: string; attivo: boolean }[] | null;
  defaultCommittente: string;
  defaultTerritorio: string;
  onClose: () => void;
  onAdd: (data: ManualTaskData) => Promise<void> | void;
}) {
  const [d, setD] = useState<ManualTaskData>({
    committente: defaultCommittente, territorio: defaultTerritorio,
    indirizzo: '', cap: '', citta: '', odl: '', pdr: '', matricola: '', attivita: '', fascia_oraria: '', nominativo: '', staffId: '', note: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ManualTaskData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.value }));

  // I default possono arrivare DOPO il mount (la tassonomia si carica all'apertura):
  // riempi solo i campi ancora vuoti, mai una scelta già fatta dall'ufficio.
  useEffect(() => {
    setD((prev) => {
      const next = { ...prev };
      if (!next.committente && defaultCommittente) next.committente = defaultCommittente;
      if (!next.territorio && defaultTerritorio) next.territorio = defaultTerritorio;
      return next.committente !== prev.committente || next.territorio !== prev.territorio ? next : prev;
    });
  }, [defaultCommittente, defaultTerritorio]);

  // Committente e territorio OBBLIGATORI: prima venivano dati per scontati dal piano
  // (default 'acea') e un giro AcquaLatina caricava gli interventi manuali su ACEA.
  const valido = d.indirizzo.trim() !== '' && d.citta.trim() !== '' && d.committente !== '' && d.territorio !== '';
  const inputCls = 'w-full rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm text-[var(--brand-text-main)] focus:border-[var(--brand-primary)] focus:outline-none';

  // Suggerimenti attività del SOLO committente scelto (forme canoniche della tassonomia):
  // evitano i liberi "SOSTITUZIONE CONTATORI"/typo che non risolvono gruppo e flusso.
  const attivitaSuggerite = (righeTassonomia ?? [])
    .filter((r) => r.attivo && r.committente === d.committente)
    .map((r) => r.descrizione)
    .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));

  const handleAdd = async () => {
    if (!valido || saving) return;
    setSaving(true);
    try {
      await onAdd(d);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--brand-border)] px-5 py-3">
          <h3 className="text-base font-semibold text-[var(--brand-text-main)]">Aggiungi intervento manuale</h3>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-lg border border-[var(--brand-border)] px-2 py-1 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">✕</button>
        </div>
        <div className="grid flex-1 gap-3 overflow-auto p-5 sm:grid-cols-2">
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Committente *</span>
            <select className={inputCls} value={d.committente} onChange={set('committente')}>
              <option value="" disabled>— Seleziona committente —</option>
              {committenti.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Territorio *</span>
            <select className={inputCls} value={d.territorio} onChange={set('territorio')}>
              <option value="" disabled>— Seleziona territorio —</option>
              {territori.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Indirizzo *</span><input className={inputCls} value={d.indirizzo} onChange={set('indirizzo')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">CAP</span><input className={inputCls} value={d.cap} onChange={set('cap')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Comune *</span><input className={inputCls} value={d.citta} onChange={set('citta')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">ODS/ODL</span><input className={inputCls} value={d.odl} onChange={set('odl')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">PDR</span><input className={inputCls} value={d.pdr} onChange={set('pdr')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Matricola</span><input className={inputCls} value={d.matricola} onChange={set('matricola')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Attività</span>
            <input className={inputCls} value={d.attivita} onChange={set('attivita')} list="manual-task-attivita" placeholder={attivitaSuggerite[0] ? `Es. ${attivitaSuggerite[0]}` : undefined} />
            <datalist id="manual-task-attivita">
              {attivitaSuggerite.map((a) => (<option key={a} value={a} />))}
            </datalist>
          </label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nota per l&apos;operatore</span><textarea className={inputCls} rows={2} value={d.note} onChange={set('note')} placeholder="Es. citofonare Rossi, accesso dal retro…" /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Fascia oraria</span><input className={inputCls} value={d.fascia_oraria} onChange={set('fascia_oraria')} /></label>
          <label><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Nominativo</span><input className={inputCls} value={d.nominativo} onChange={set('nominativo')} /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Esecutore</span>
            <select className={inputCls} value={d.staffId} onChange={set('staffId')}>
              <option value="">— nessuno / auto —</option>
              {operators.map((o) => (<option key={o.id} value={o.id}>{o.displayName}</option>))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--brand-border)] px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-[var(--brand-border)] px-4 py-2 text-sm text-[var(--brand-text-muted)] hover:bg-[var(--brand-surface-muted)]">Annulla</button>
          <button onClick={handleAdd} disabled={!valido || saving} className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-semibold text-[var(--on-primary)] hover:opacity-90 disabled:opacity-50">
            {saving ? 'Aggiungo…' : 'Aggiungi'}
          </button>
        </div>
      </div>
    </div>
  );
}
