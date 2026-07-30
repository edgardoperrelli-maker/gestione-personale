'use client';

// Cascata «GRUPPO ATTIVITÀ → dettaglio attività» dalla tassonomia (lista chiusa, spec §7).
// Sostituisce la select piatta «descrizione — gruppo» del "+" operatore e della revisione
// ufficio: prima si sceglie il gruppo del committente, poi il dettaglio tra le SOLE attività
// di quel gruppo — così la scelta resta a catalogo e non nascono più classificazioni errate.
// Il valore salvato resta la DESCRIZIONE (invariato per server e approvazione).

import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/ui/Select';
import { chiaveTassonomia, type TassonomiaRiga } from '@/lib/attivita/tassonomia';
import {
  gruppiAttivitaManuale,
  gruppoDellAttivita,
  opzioniDelGruppo,
} from '@/lib/interventi/manuali/opzioniAttivitaManuale';

export function SelettoreAttivitaTassonomia({
  opzioni,
  valore,
  onChange,
  etichettaAttivita,
  compatto = false,
  wrapperClassName = 'col-span-full min-w-0',
}: {
  /** Righe tassonomia già filtrate per committente (opzioniAttivitaManuale). */
  opzioni: TassonomiaRiga[];
  /** Descrizione attività corrente (anagrafica.attivita). */
  valore: string;
  onChange: (attivita: string) => void;
  /** Etichetta del dettaglio: dal template se dichiarata, altrimenti il default. */
  etichettaAttivita: string;
  /** true = stile compatto della revisione ufficio (xs); false = modale operatore (base, ≥16px per iOS). */
  compatto?: boolean;
  wrapperClassName?: string;
}) {
  const [gruppoScelto, setGruppoScelto] = useState('');

  const gruppi = useMemo(() => gruppiAttivitaManuale(opzioni), [opzioni]);
  // Gruppo effettivo: la scelta esplicita se ancora valida; altrimenti quello dell'attività
  // già valorizzata (default committente, revisione, task-via); altrimenti l'unico disponibile.
  const gruppoEff = useMemo(() => {
    const k = chiaveTassonomia(gruppoScelto);
    const esplicito = k ? gruppi.find((g) => chiaveTassonomia(g) === k) : undefined;
    if (esplicito) return esplicito;
    const daValore = gruppoDellAttivita(opzioni, valore);
    if (daValore) return daValore;
    return gruppi.length === 1 ? gruppi[0] : '';
  }, [gruppoScelto, gruppi, opzioni, valore]);
  const dettagli = useMemo(() => opzioniDelGruppo(opzioni, gruppoEff), [opzioni, gruppoEff]);

  // Valore fuori catalogo (richieste storiche pre-tassonomia, o committente cambiato):
  // resta VISIBILE come opzione dedicata invece di sopravvivere nascosto nello stato.
  const fuoriCatalogo =
    valore.trim() !== '' && !opzioni.some((o) => o.descrizioneNorm === chiaveTassonomia(valore));

  // Unico dettaglio nel gruppo (task-via, gruppi mono-attività) → auto-selezione.
  useEffect(() => {
    if (!gruppoEff || dettagli.length !== 1 || valore.trim() !== '') return;
    onChange(dettagli[0].descrizione);
  }, [gruppoEff, dettagli, valore, onChange]);

  const cambiaGruppo = (g: string) => {
    setGruppoScelto(g);
    const nelGruppo = opzioniDelGruppo(opzioni, g);
    const valida = valore.trim() !== '' && nelGruppo.some((o) => o.descrizioneNorm === chiaveTassonomia(valore));
    if (!valida) onChange(nelGruppo.length === 1 ? nelGruppo[0].descrizione : '');
  };

  const labelCls = compatto
    ? 'mb-0.5 block truncate text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]'
    : 'mb-1 block truncate text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]';
  // 16px minimi nella modale operatore: sotto, iOS Safari zooma la pagina al focus del campo.
  const selectCls = compatto ? 'py-1.5 text-xs' : 'text-base';

  return (
    <>
      <div className={wrapperClassName}>
        <label className={labelCls}>
          GRUPPO ATTIVITÀ<span className="text-[var(--danger)]"> *</span>
        </label>
        <Select required value={gruppoEff} onChange={(e) => cambiaGruppo(e.target.value)} className={selectCls}>
          <option value="">— scegli il gruppo —</option>
          {gruppi.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </Select>
      </div>
      <div className={wrapperClassName}>
        <label className={labelCls}>
          {etichettaAttivita}
          <span className="text-[var(--danger)]"> *</span>
        </label>
        <Select
          required
          disabled={!gruppoEff && !fuoriCatalogo}
          value={valore}
          onChange={(e) => onChange(e.target.value)}
          className={selectCls}
        >
          <option value="">{gruppoEff ? "— scegli l'attività —" : '— prima scegli il gruppo —'}</option>
          {fuoriCatalogo && (
            <option value={valore}>{valore} — fuori catalogo</option>
          )}
          {dettagli.map((o) => (
            <option key={`${o.committente}|${o.descrizione}`} value={o.descrizione}>
              {o.descrizione}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
