/* Hallmark · redesign: Cockpit-aligned · tone: utilitarian · anchor hue: sapphire 260 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, RotateCw, TriangleAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/Card';
import Button from '@/components/Button';
import Badge from '@/components/Badge';
import Select from '@/components/ui/Select';
import Input from '@/components/Input';
import type { RegolaMappa } from '@/lib/agente/decisione';
import type { AgenteFileColonneRow } from '@/lib/agente/uiTypes';
import { columnsDaFile, colonneRilevate, uniscoMappaturaColonna, mappaturaCompleta, colonneDuplicate } from '@/lib/agente/colonneView';
import { formattaIstante } from '@/lib/agente/uiTypes';

const ETICHETTA_CAMPO: Record<string, string> = {
  esecutore: 'Esecutore',
  data: 'Data',
  esito: 'Esito',
  sigillo: 'Sigillo',
  matricola: 'Matricola',
  via: 'Via',
  pdr: 'PDR',
  nominativo: 'Nominativo',
  comune: 'Comune',
  saracinesca: 'Saracinesca',
  note: 'Nota (solo esito negativo)',
  marcatore: 'Marcatore (solo extra)',
  automazione: 'Automazione (righe toccate)',
};

export function ColonneCard({
  files,
  mappatura,
  esitoPositivo,
  esitoNegativo,
  onChange,
}: {
  files: AgenteFileColonneRow[];
  mappatura: RegolaMappa[];
  esitoPositivo: string;
  esitoNegativo: string;
  onChange: (p: { mappatura?: RegolaMappa[]; esito_positivo?: string; esito_negativo?: string }) => void;
}) {
  const opzioni = colonneRilevate(files);
  const router = useRouter();
  const [mostraColonne, setMostraColonne] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function aggiornaTabella() {
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch('/api/admin/agente/aggiorna-colonne', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setScanMsg('Ri-lettura richiesta: le colonne si aggiornano al prossimo contatto dell\'agente (entro l\'ora).');
        router.refresh();
      } else {
        setScanMsg(`Errore: ${j.error ?? res.status}`);
      }
    } catch (e) {
      setScanMsg(`Errore: ${e instanceof Error ? e.message : 'rete'}`);
    } finally {
      setScanning(false);
    }
  }

  function setColonna(campo: string, colonna: string) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { colonna }) });
  }
  function setAbilitato(campo: string, abilitato: boolean) {
    onChange({ mappatura: uniscoMappaturaColonna(mappatura, campo, { abilitato }) });
  }

  return (
    <Card animated={false}>
      <CardContent className="space-y-5">
        <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>Colonne & scrittura</h2>

        {/* Colonne rilevate per file (fisarmonica + Aggiorna tabella) */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMostraColonne((v) => !v)}
              className="flex items-center gap-2 rounded-[var(--radius-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              aria-expanded={mostraColonne}
            >
              {mostraColonne
                ? <ChevronDown size={15} style={{ color: 'var(--brand-text-subtle)' }} aria-hidden />
                : <ChevronRight size={15} style={{ color: 'var(--brand-text-subtle)' }} aria-hidden />}
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
                Colonne rilevate (<span className="font-mono tabular-nums">{files.length}</span>)
              </span>
            </button>
            <div className="flex items-center gap-2">
              {scanMsg && <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>{scanMsg}</span>}
              <Button variant="soft" size="sm" onClick={aggiornaTabella} loading={scanning}>
                {!scanning && <RotateCw size={14} aria-hidden />}
                {scanning ? 'Aggiorno…' : 'Aggiorna tabella'}
              </Button>
            </div>
          </div>
          {mostraColonne && files.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>Nessuna scansione ricevuta dall&apos;agente.</p>
          )}
          {mostraColonne && files.map((f) => {
            const dupSet = new Set(colonneDuplicate(f.colonne).map((c) => c.toLowerCase()));
            return (
              <div key={f.file} className="rounded-[var(--radius-lg)] border p-3" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--brand-text-main)' }}>{f.file}</span>
                  {f.is_master && <Badge variant="primary">master</Badge>}
                  <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--brand-text-muted)' }}>· {formattaIstante(f.rilevato_il)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {columnsDaFile(f).map((c) => {
                    const isDuplicate = dupSet.has(c.nome.toLowerCase());
                    return (
                      <span
                        key={`${f.file}:${c.nome}`}
                        className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-0.5 text-xs"
                        style={
                          c.stato === 'nuova'
                            ? { borderColor: 'var(--success)', backgroundColor: 'var(--success-soft)', color: 'var(--success)' }
                            : c.stato === 'sparita'
                              ? { borderColor: 'var(--danger)', backgroundColor: 'var(--danger-soft)', color: 'var(--danger)', textDecoration: 'line-through' }
                              : { borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-muted)' }
                        }
                        title={c.stato === 'nuova' ? 'Colonna nuova' : c.stato === 'sparita' ? 'Colonna sparita' : undefined}
                      >
                        {c.nome}
                        {isDuplicate && (
                          <span
                            className="rounded-[var(--radius-sm)] px-1 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: 'var(--danger)', color: 'var(--on-danger)' }}
                            title="Questa intestazione compare più di una volta nel file"
                          >
                            DUPLICATA
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Editor mappa */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>Mappa di scrittura</h3>
          <div className="space-y-2">
            {mappaturaCompleta(mappatura).map((r) => {
              const colonnaAssente =
                r.abilitato &&
                r.auto !== true &&
                r.colonna !== '' &&
                !opzioni.includes(r.colonna);
              return (
                <div key={r.campo} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-2"
                  style={{ borderColor: 'var(--brand-border)' }}>
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--brand-text-main)' }}>
                    <input
                      type="checkbox"
                      checked={r.abilitato}
                      onChange={(e) => setAbilitato(r.campo, e.target.checked)}
                      className="accent-[var(--brand-primary)]"
                    />
                    <span className="w-40 font-medium">{ETICHETTA_CAMPO[r.campo] ?? r.campo}</span>
                  </label>
                  <span className="inline-block min-w-[12rem]">
                    <Select
                      value={r.colonna}
                      onChange={(e) => setColonna(r.campo, e.target.value)}
                      disabled={r.auto === true}
                      className="py-1.5 text-sm"
                    >
                      <option value="">{r.auto ? '(auto)' : '— scegli colonna —'}</option>
                      {!opzioni.includes(r.colonna) && r.colonna !== '' && (
                        <option value={r.colonna}>{r.colonna} (non rilevata)</option>
                      )}
                      {opzioni.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </Select>
                  </span>
                  {r.auto && (
                    <span className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>colonna libera auto-rilevata</span>
                  )}
                  {colonnaAssente && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--danger)' }}>
                      <TriangleAlert size={13} className="shrink-0" aria-hidden />
                      colonna non presente nei file — la regola verrà saltata
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Testi esito */}
        <div className="flex flex-wrap items-end gap-4">
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
              Testo esito positivo
            </span>
            <span className="inline-block w-56">
              <Input
                type="text"
                value={esitoPositivo}
                onChange={(e) => onChange({ esito_positivo: e.target.value })}
                className="py-1.5 text-sm"
              />
            </span>
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--brand-text-muted)' }}>
              Testo esito negativo
            </span>
            <span className="inline-block w-56">
              <Input
                type="text"
                value={esitoNegativo}
                onChange={(e) => onChange({ esito_negativo: e.target.value })}
                className="py-1.5 text-sm"
              />
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
