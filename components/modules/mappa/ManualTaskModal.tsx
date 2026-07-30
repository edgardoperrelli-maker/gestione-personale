'use client';

import { useEffect, useState } from 'react';
import { chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import {
  gruppiAttivitaManuale,
  gruppoDellAttivita,
  opzioniAttivitaManuale,
  opzioniDelGruppo,
} from '@/lib/interventi/manuali/opzioniAttivitaManuale';

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
  /** Tassonomia per la cascata gruppo → dettaglio del committente scelto (null = non caricata). */
  righeTassonomia: TassonomiaRiga[] | null;
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

  // Attività a CASCATA dal catalogo del committente scelto: prima il GRUPPO, poi il
  // dettaglio tra le sole attività di quel gruppo. Niente più testo libero — i
  // "SOSTITUZIONE CONTATORI"/typo che non risolvevano gruppo e flusso non possono
  // più nascere. Con una sola opzione (es. AcquaLatina) gruppo e dettaglio si
  // auto-selezionano.
  const [gruppoScelto, setGruppoScelto] = useState('');
  const opzioniAttivita = opzioniAttivitaManuale(righeTassonomia ?? undefined, d.committente);
  const gruppi = gruppiAttivitaManuale(opzioniAttivita);
  const gruppoEff = (() => {
    const k = chiaveTassonomia(gruppoScelto);
    const esplicito = k ? gruppi.find((g) => chiaveTassonomia(g) === k) : undefined;
    if (esplicito) return esplicito;
    const daValore = gruppoDellAttivita(opzioniAttivita, d.attivita);
    if (daValore) return daValore;
    return gruppi.length === 1 ? gruppi[0] : '';
  })();
  const dettagli = opzioniDelGruppo(opzioniAttivita, gruppoEff);

  const cambiaGruppo = (g: string) => {
    setGruppoScelto(g);
    const nelGruppo = opzioniDelGruppo(opzioniAttivita, g);
    setD((prev) => {
      const valida = prev.attivita.trim() !== ''
        && nelGruppo.some((o) => o.descrizioneNorm === chiaveTassonomia(prev.attivita));
      if (valida) return prev;
      return { ...prev, attivita: nelGruppo.length === 1 ? nelGruppo[0].descrizione : '' };
    });
  };

  // Committente cambiato → il gruppo esplicito si azzera (si ri-deriva) e l'attività
  // sopravvive solo se ancora a catalogo per il nuovo committente.
  useEffect(() => {
    setGruppoScelto('');
    setD((prev) => {
      const att = prev.attivita.trim();
      if (!att) return prev;
      const opz = opzioniAttivitaManuale(righeTassonomia ?? undefined, prev.committente);
      return opz.some((o) => o.descrizioneNorm === chiaveTassonomia(att)) ? prev : { ...prev, attivita: '' };
    });
  }, [d.committente, righeTassonomia]);

  // Unico dettaglio nel gruppo (es. AcquaLatina → "Sostituzione misuratore") → auto-selezione.
  useEffect(() => {
    const nelGruppo = opzioniDelGruppo(opzioniAttivita, gruppoEff);
    if (!gruppoEff || nelGruppo.length !== 1) return;
    setD((prev) => (prev.attivita.trim() !== '' ? prev : { ...prev, attivita: nelGruppo[0].descrizione }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gruppoEff, righeTassonomia, d.committente]);

  const placeholderGruppo = !d.committente
    ? '— prima scegli il committente —'
    : righeTassonomia == null
      ? '— caricamento catalogo… —'
      : gruppi.length === 0
        ? '— nessuna attività a catalogo —'
        : '— scegli il gruppo —';

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
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Gruppo attività</span>
            <select className={inputCls} value={gruppoEff} onChange={(e) => cambiaGruppo(e.target.value)} disabled={gruppi.length === 0}>
              <option value="">{placeholderGruppo}</option>
              {gruppi.map((g) => (<option key={g} value={g}>{g}</option>))}
            </select>
          </label>
          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-[var(--brand-text-muted)]">Attività</span>
            <select className={inputCls} value={d.attivita} onChange={set('attivita')} disabled={!gruppoEff}>
              <option value="">{gruppoEff ? "— scegli l'attività —" : '— prima scegli il gruppo —'}</option>
              {dettagli.map((o) => (<option key={`${o.committente}|${o.descrizione}`} value={o.descrizione}>{o.descrizione}</option>))}
            </select>
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
