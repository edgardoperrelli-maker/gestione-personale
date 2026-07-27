'use client';

import { Download } from 'lucide-react';
import Button from '@/components/Button';
import MultiSelect from '@/components/ui/MultiSelect';
import type { DefColonna } from '@/lib/acea/colonneTabella';

type Props = {
  colonne: DefColonna[];
  visibili: Set<string>;
  onChange: (v: Set<string>) => void;
  onEsporta: () => void;
  esportando?: boolean;
};

/**
 * Scelta delle colonne visibili + export della vista filtrata corrente.
 *
 * Usa `MultiSelect` del sistema invece del popover che questo file si disegnava da sé: stesso
 * gesto in tutta la console, e in cambio arrivano gratis la chiusura su Esc, il ruolo `listbox`,
 * `aria-multiselectable` e il focus ring — che la versione a mano non aveva.
 *
 * `selezioneEsplicita` perché qui «vuoto» non vuol dire «nessun filtro, mostrale tutte»: vuol dire
 * una tabella senza colonne. È la semantica opt-in del primitivo, fatta esattamente per questo caso.
 */
export default function MenuColonne({ colonne, visibili, onChange, onEsporta, esportando }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-52">
        <MultiSelect
          label="Colonne"
          ariaLabel="Colonne visibili"
          selezioneEsplicita
          options={colonne.map((c) => ({ value: c.chiave, label: c.intestazione }))}
          values={colonne.filter((c) => visibili.has(c.chiave)).map((c) => c.chiave)}
          onChange={(v) => {
            // Almeno una colonna deve restare: una tabella vuota non è uno stato utile, e il
            // «Nessuno» del primitivo ci arriverebbe in un click.
            if (v.length === 0) return;
            onChange(new Set(v));
          }}
        />
      </div>

      <Button variant="outline" size="sm" onClick={onEsporta} loading={esportando}>
        <Download size={14} aria-hidden="true" />
        Esporta vista
      </Button>
    </div>
  );
}
