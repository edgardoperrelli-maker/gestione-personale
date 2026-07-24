'use client';

import type { ErroreImport } from '@/lib/attivita/validaImport';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';

const TITOLI: Record<ErroreImport['tipo'], string> = {
  descrizione_mancante: 'Righe senza descrizione attività',
  descrizione_sconosciuta: 'Descrizione attività non riconosciuta',
  gruppo_incoerente: 'Gruppo attività non coerente',
  formato_non_ufficiale: 'Formato file non ammesso',
  tassonomia_non_disponibile: 'Catalogo attività non raggiungibile',
};

/** Elenca al massimo 8 numeri riga, poi "e altre N". */
function righeLabel(righe: number[]): string {
  const prime = righe.slice(0, 8).join(', ');
  return righe.length > 8 ? `${prime} e altre ${righe.length - 8}` : prime;
}

export function ModaleErroreImport({ errori, onClose }: { errori: ErroreImport[]; onClose: () => void }) {
  const soloFormato = errori.length > 0 && errori.every((e) => e.tipo === 'formato_non_ufficiale');
  const soloTassonomia = errori.length > 0 && errori.every((e) => e.tipo === 'tassonomia_non_disponibile');
  return (
    <Dialog open onClose={onClose} title="File rifiutato" footer={<Button onClick={onClose} size="sm">Ho capito</Button>}>
      <p className="text-sm text-[var(--brand-text-muted)]">
        {soloFormato
          ? 'La pianificazione accetta solo il template UFFICIALE (pulsante «Scarica template»): scaricalo, compilalo e ricaricalo. Nessuna riga è stata importata.'
          : soloTassonomia
            ? 'Il catalogo attività non è al momento raggiungibile, quindi le descrizioni non possono essere validate. Riprova tra poco: nessuna riga è stata importata.'
            : 'Il file non rispetta la tassonomia attività: correggi le righe indicate e ricaricalo. Nessuna riga è stata importata.'}
      </p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
        {errori.map((e, i) => (
          <li key={i} className="rounded-[var(--radius-md)] border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-2">
            <div className="font-medium text-[var(--brand-text-main)]">{TITOLI[e.tipo]}</div>
            {e.valore ? <div className="font-mono text-xs">«{e.valore}»</div> : null}
            {e.atteso ? <div className="text-xs">Atteso: «{e.atteso}»</div> : null}
            {e.righe.length > 0 ? (
              <div className="text-xs text-[var(--brand-text-subtle)]">Righe file: {righeLabel(e.righe)}</div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-[var(--brand-text-subtle)]">
        {soloFormato
          ? 'Il template ufficiale ha il foglio «Interventi» con le colonne originali (GRUPPO e COMMITTENTE si compilano da soli) e il foglio «Leggenda».'
          : soloTassonomia
            ? 'Se il problema persiste, avvisa un amministratore.'
            : 'Le descrizioni valide sono nel foglio «Leggenda» del template scaricabile.'}
      </p>
    </Dialog>
  );
}
