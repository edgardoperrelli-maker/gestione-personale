'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import Button from '@/components/Button';
import { toast } from '@/components/ui/Toast';
import {
  COLONNE_DUNNING, COLONNE_MASSIVE, dataIt, type DefColonna, type RigaTabella,
} from '@/lib/acea/colonneTabella';
import { COLONNE_EDITABILI, useEditingGriglia, type Operatore } from './useEditingGriglia';
import TabellaOrdini, { chiaveRiga } from './TabellaOrdini';
import BarraFiltriAcea from './BarraFiltriAcea';
import BarraAzioni from './BarraAzioni';
import MenuColonne from './MenuColonne';
import { esportaVista } from './esportaVista';
import { useOrdiniAcea } from './useOrdiniAcea';

/** Registro ordini con filtri, tabella virtualizzata e selezione. Condiviso da Dunning e Massive. */
export default function RegistroAcea({
  famiglia,
  refreshKey = 0,
}: {
  famiglia: 'dunning' | 'massive';
  refreshKey?: number;
}) {
  const colonne: DefColonna[] = famiglia === 'dunning' ? COLONNE_DUNNING : COLONNE_MASSIVE;
  const [visibili, setVisibili] = useState<Set<string>>(
    () => new Set(colonne.filter((c) => c.predefinita).map((c) => c.chiave)),
  );
  const [selezione, setSelezione] = useState<RowSelectionState>({});
  const [esportando, setEsportando] = useState(false);

  const {
    filtri, setFiltri, righe, totale, oggi, caricando, errore, opzioni, altre, tutteCaricate,
    ricarica,
  } = useOrdiniAcea(famiglia, refreshKey);

  const colonneVisibili = useMemo(
    () => colonne.filter((c) => visibili.has(c.chiave)),
    [colonne, visibili],
  );

  const selezionate: RigaTabella[] = useMemo(
    () => righe.filter((r) => selezione[chiaveRiga(r)]),
    [righe, selezione],
  );

  // Operatori: servono sia alla barra azioni sia alla validazione dei nomi incollati in griglia.
  const [operatori, setOperatori] = useState<Operatore[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/personale');
        if (!res.ok) return;
        const body = (await res.json()) as { rows?: Operatore[] } | Operatore[];
        const rows = Array.isArray(body) ? body : (body.rows ?? []);
        setOperatori(rows.filter((r) => r.id && r.display_name));
      } catch {
        /* senza elenco l'editing sui nomi non valida, ma la tabella resta usabile */
      }
    })();
  }, []);

  const editing = useEditingGriglia({
    righe,
    operatori,
    onSalvato: () => ricarica(),
    attivo: true,
  });

  const indiceEditabile = useCallback((chiave: string) => {
    const i = COLONNE_EDITABILI.indexOf(chiave as (typeof COLONNE_EDITABILI)[number]);
    return i >= 0 ? i : null;
  }, []);

  /** Valore non ancora confermato dal server, mostrato in corsivo finché non si ricarica. */
  const valoreLocale = useCallback((r: RigaTabella, chiave: string): string | null => {
    const loc = editing.locali.get(`${r.odl}|${r.numero_operazione}`);
    if (!loc) return null;
    if (chiave === 'pianificato_a') return loc.pianificato_a ?? null;
    if (chiave === 'pianificato_il') return loc.pianificato_il ? dataIt(loc.pianificato_il) : null;
    return null;
  }, [editing.locali]);

  const esporta = useCallback(async () => {
    setEsportando(true);
    try {
      const oggiCompatto = (oggi || new Date().toISOString().slice(0, 10)).replaceAll('-', '');
      await esportaVista(righe, colonneVisibili, `acea-${famiglia}-${oggiCompatto}.xlsx`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export non riuscito.');
    } finally {
      setEsportando(false);
    }
  }, [righe, colonneVisibili, famiglia, oggi]);

  if (errore) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface-muted)] p-4">
        <p className="text-sm text-[var(--brand-text-main)]">{errore}</p>
        <p className="mt-1 text-xs text-[var(--brand-text-muted)]">
          Se il registro è vuoto, carica un export dal Cruscotto ACEA.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <BarraFiltriAcea
          filtri={filtri}
          onChange={setFiltri}
          opzioni={opzioni}
          conScadenza={famiglia === 'dunning'}
          totale={totale}
          caricate={righe.length}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[var(--brand-text-muted)]">
          {selezionate.length === 0 &&
            'Seleziona le righe da pianificare (shift-click per un intervallo)'}
        </span>
        <MenuColonne
          colonne={colonne}
          visibili={visibili}
          onChange={setVisibili}
          onEsporta={() => void esporta()}
          esportando={esportando}
        />
      </div>

      <BarraAzioni
        chiavi={selezionate.map(chiaveRiga)}
        onAnnullaSelezione={() => setSelezione({})}
        onPianificato={ricarica}
      />

      <TabellaOrdini
        righe={righe}
        colonne={colonne}
        colonneVisibili={visibili}
        oggi={oggi}
        selezione={selezione}
        onSelezione={setSelezione}
        caricando={caricando}
        editing={{
          indiceEditabile,
          focus: editing.focus,
          celleSelezionate: editing.celleSelezionate,
          valoreLocale,
          onClickCella: editing.clickCella,
        }}
      />

      <p className="text-xs text-[var(--brand-text-muted)]">
        Esecutore e Data pianificata si modificano direttamente in tabella: clicca una cella, usa le
        frecce per spostarti, <kbd>Shift</kbd>+frecce o shift-click per un intervallo,{' '}
        <kbd>Ctrl</kbd>+<kbd>C</kbd> e <kbd>Ctrl</kbd>+<kbd>V</kbd> per copiare e incollare anche
        da Excel. I campi ACEA non sono modificabili.
        {editing.salvando && <span className="ml-2 italic">salvataggio in corso…</span>}
      </p>

      {!tutteCaricate && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={altre} loading={caricando}>
            Carica altre {Math.min(300, totale - righe.length)} righe
          </Button>
        </div>
      )}
    </div>
  );
}
