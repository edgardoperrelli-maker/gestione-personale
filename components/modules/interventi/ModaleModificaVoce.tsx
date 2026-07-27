// components/modules/interventi/ModaleModificaVoce.tsx
'use client';

import { useEffect, useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import { ANAGRAFICA_COLONNE, ANAGRAFICA_LABEL } from '@/lib/interventi/storico/modifica';
import type { TemplateCampo } from '@/utils/rapportini/buildVoci';

type Staff = { id: string; display_name: string };

type EditorData = {
  anagrafica: Record<string, string | null>;
  risposte: Record<string, unknown>;
  campi: TemplateCampo[];
  /** Esecutore corrente = staff del rapportino padre (è da lì che lo legge lo storico). */
  esecutore?: { staffId: string | null; nome: string | null; data: string | null };
};

const fmtGiorno = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

function CampoInput({ campo, valore, onChange }: { campo: TemplateCampo; valore: unknown; onChange: (v: unknown) => void }) {
  if (campo.tipo === 'crocetta') {
    return (
      <input
        type="checkbox"
        checked={valore === true || valore === 'true'}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[var(--brand-primary)]"
        aria-label={campo.etichetta}
      />
    );
  }
  if (campo.tipo === 'select') {
    return (
      <Select value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(campo.opzioni ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
      </Select>
    );
  }
  if (campo.tipo === 'numero') {
    return (
      <Input
        type="number"
        inputMode="decimal"
        value={typeof valore === 'number' || typeof valore === 'string' ? String(valore) : ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }
  return (
    <Textarea rows={2} value={typeof valore === 'string' ? valore : ''} onChange={(e) => onChange(e.target.value)} className="resize-y" />
  );
}

export default function ModaleModificaVoce({
  voceId, staff, puoCambiareEsecutore, onClose, onSaved,
}: {
  voceId: string;
  staff: Staff[];
  /** Solo gli Admin Plus riassegnano l'intervento a un altro operatore. */
  puoCambiareEsecutore: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [anagrafica, setAnagrafica] = useState<Record<string, string>>({});
  const [risposte, setRisposte] = useState<Record<string, unknown>>({});
  const [campi, setCampi] = useState<TemplateCampo[]>([]);
  const [esecutoreId, setEsecutoreId] = useState('');
  const [esecutoreIniziale, setEsecutoreIniziale] = useState('');
  const [giorno, setGiorno] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}`);
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? 'Errore caricamento.');
        }
        const data = (await res.json()) as EditorData;
        if (!alive) return;
        const a: Record<string, string> = {};
        for (const k of ANAGRAFICA_COLONNE) a[k] = (data.anagrafica?.[k] ?? '') as string;
        setAnagrafica(a);
        setRisposte({ ...(data.risposte ?? {}) });
        setCampi(Array.isArray(data.campi) ? data.campi : []);
        const corrente = data.esecutore?.staffId ?? '';
        setEsecutoreId(corrente);
        setEsecutoreIniziale(corrente);
        setGiorno(data.esecutore?.data ?? null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Errore caricamento.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [voceId]);

  const salva = async () => {
    setSaving(true);
    setError(null);
    try {
      const cambiaEsecutore = puoCambiareEsecutore && esecutoreId && esecutoreId !== esecutoreIniziale;
      const res = await fetch(`/api/admin/interventi/storico/voce/${voceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anagrafica, risposte, ...(cambiaEsecutore ? { esecutoreId } : {}) }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? 'Errore salvataggio.');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio.');
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Annulla</Button>
      <Button variant="primary" size="sm" onClick={salva} loading={saving}>Salva</Button>
    </>
  );

  return (
    <Dialog open onClose={onClose} title="Modifica intervento" className="max-w-2xl" footer={footer}>
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-[var(--brand-text-muted)]">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand-border)] border-t-[var(--brand-primary)]" />
          Caricamento…
        </div>
      ) : (
        <div className="space-y-5">
          {puoCambiareEsecutore && (
            <section>
              <h3 className="mb-2 text-xs font-semibold text-[var(--brand-text-muted)]">Esecutore</h3>
              <Select value={esecutoreId} onChange={(e) => setEsecutoreId(e.target.value)}>
                {esecutoreId === '' && <option value="">—</option>}
                {staff.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
              </Select>
              {esecutoreId !== esecutoreIniziale && (
                <p className="mt-2 text-xs text-[var(--brand-text-muted)]">
                  L&apos;intervento passa nel rapportino{giorno ? ` del ${fmtGiorno(giorno)}` : ''} del nuovo
                  operatore. Se non ne ha uno, viene creato.
                </p>
              )}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold text-[var(--brand-text-muted)]">Anagrafica</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {ANAGRAFICA_COLONNE.map((k) => (
                <label key={k} className="block">
                  <span className="mb-1 block text-xs text-[var(--brand-text-muted)]">{ANAGRAFICA_LABEL[k]}</span>
                  <Input
                    value={anagrafica[k] ?? ''}
                    onChange={(e) => setAnagrafica((p) => ({ ...p, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </section>

          {campi.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold text-[var(--brand-text-muted)]">Esiti / risposte</h3>
              <div className="space-y-3">
                {campi.map((c) => (
                  <label key={c.chiave} className="flex items-start gap-3">
                    <span className="mt-1 w-40 shrink-0 text-sm text-[var(--brand-text-main)]">{c.etichetta}</span>
                    <span className="flex-1">
                      <CampoInput campo={c} valore={risposte[c.chiave]} onChange={(v) => setRisposte((p) => ({ ...p, [c.chiave]: v }))} />
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div className="rounded-[var(--radius-md)] border border-[var(--status-ko)] bg-[var(--status-ko-soft)] px-4 py-2 text-sm text-[var(--status-ko)]">{error}</div>
          )}
        </div>
      )}
    </Dialog>
  );
}
