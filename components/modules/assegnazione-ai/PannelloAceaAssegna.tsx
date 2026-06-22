'use client';

import Button from '@/components/Button';
import { Card, CardContent } from '@/components/Card';
import type { AceaEsiti } from './tipi';

// ─── Props ───────────────────────────────────────────────────────────────────
// Solo gli ESITI: il trigger (toggle Prova + "Assegna su ACEA") vive nella barra azioni
// della foglia, accanto a "Crea rapportini", e rispetta la selezione.

type PannelloAceaAssegnaProps = {
  msg: string | null;
  esiti: AceaEsiti | null;
  checking: boolean;
  onRicarica: () => void;
};

// ─── Componente ──────────────────────────────────────────────────────────────

export function PannelloAceaAssegna({ msg, esiti, checking, onRicarica }: PannelloAceaAssegnaProps) {
  return (
    <Card animated={false}>
    <CardContent className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold" style={{ color: 'var(--brand-text-main)' }}>
          Esito assegnazione ACEA
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRicarica}
          disabled={checking}
          className="ml-auto"
        >
          {checking ? '…' : '↻ Aggiorna esito'}
        </Button>
      </div>
      {msg && <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>{msg}</p>}

      {esiti?.ultimoRun ? (
        <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
          Ultimo giro: <strong>{esiti.ultimoRun.dryRun ? 'PROVA' : 'REALE'}</strong> · giorno{' '}
          {esiti.ultimoRun.giorno ?? '—'} · {esiti.ultimoRun.lavori} ODL ·{' '}
          {new Date(esiti.ultimoRun.creato_il).toLocaleString('it-IT')}
          {esiti.ultimoRun.lavori === 0 && (
            <span style={{ color: 'var(--warning)' }}> — 0 ODL: niente da assegnare.</span>
          )}
          {esiti.ultimoRun.errore && (
            <span style={{ color: 'var(--danger)' }}> — errore: {esiti.ultimoRun.errore}</span>
          )}
        </p>
      ) : (
        <p className="text-xs" style={{ color: 'var(--brand-text-muted)' }}>
          Nessun giro ACEA ancora registrato.
        </p>
      )}

      {esiti && Object.keys(esiti.riepilogo).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(esiti.riepilogo).map(([k, n]) => (
            <span
              key={k}
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: 'var(--brand-surface)',
                border: '1px solid var(--brand-border)',
                color: 'var(--brand-text-main)',
              }}
            >
              {k}: {n}
            </span>
          ))}
        </div>
      )}

      {esiti && esiti.righe.length > 0 && (
        <div className="overflow-auto" style={{ maxHeight: '14rem' }}>
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--brand-text-muted)' }}>
                {['ODL', 'Operatore', 'Esito', 'Note'].map((h) => (
                  <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {esiti.righe.slice(0, 100).map((r, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid var(--brand-border)', color: 'var(--brand-text-main)' }}
                >
                  <td className="px-2 py-1 whitespace-nowrap font-mono">{r.odl}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.operatore_acea ?? '—'}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {r.esito}{r.dry_run ? ' (prova)' : ''}
                  </td>
                  <td className="px-2 py-1">{r.motivo ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent>
    </Card>
  );
}
