'use client';

import { Download } from 'lucide-react';
import Button from '@/components/Button';
import MultiSelect from '@/components/ui/MultiSelect';
import { toast } from '@/components/ui/Toast';
import type { DefColonna } from '@/lib/acea/colonneTabella';

type Props = {
  colonne: DefColonna[];
  visibili: Set<string>;
  onChange: (v: Set<string>) => void;
  onEsporta: () => void;
  esportando?: boolean;
  /** Nessuna riga da esportare: il comando resta visibile ma non produce un foglio di sole intestazioni. */
  vuota?: boolean;
  /** Avanzamento dello scaricamento, quando l'export deve andare oltre le righe già in memoria. */
  nota?: string;
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
export default function MenuColonne({
  colonne, visibili, onChange, onEsporta, esportando, vuota, nota,
}: Props) {
  const avviso = nota ?? (vuota ? 'nessuna riga da esportare' : null);

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
            // «Nessuno» del primitivo ci arriverebbe in un click. Lo si DICE, invece di ignorare
            // la spunta in silenzio lasciando credere a un comando rotto.
            if (v.length === 0) {
              toast.info('Almeno una colonna deve restare visibile.');
              return;
            }
            onChange(new Set(v));
          }}
        />
      </div>

      {/*
        L'avanzamento sta ACCANTO al bottone e non dentro: l'export della vista intera sono più
        richieste in fila e con la sola rotella si resta a guardare un pulsante che gira senza
        sapere se sta finendo. Il conteggio è già annunciato dalla regione live della tabella,
        quindi qui basta il testo.
      */}
      {avviso && (
        <span className="text-xs tabular-nums text-[var(--brand-text-muted)]">{avviso}</span>
      )}

      {/* Il motivo del blocco è scritto accanto, non in un `title`: su un elemento disabilitato il
          tooltip nativo spesso non compare proprio, perché non riceve eventi di puntatore. */}
      <Button
        variant="outline"
        size="sm"
        onClick={onEsporta}
        loading={esportando}
        disabled={vuota}
      >
        <Download size={14} aria-hidden="true" />
        Esporta vista
      </Button>
    </div>
  );
}
