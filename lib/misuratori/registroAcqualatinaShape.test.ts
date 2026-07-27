import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATI_MISURATORE } from '@/types/misuratori';
import { APP_MODULES } from '@/lib/moduleAccess';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260727150000_acqualatina_misuratori_rimossi.sql'),
  'utf8',
);

describe('registro misuratori AcquaLatina — migrazione', () => {
  it('gli stati del DB sono ESATTAMENTE quelli del modulo, nello stesso ordine', () => {
    // È l'invariante che rende riusabile il client: `MisuratoriClient` ordina il flusso
    // logistico per indice in STATI_MISURATORE e vieta la regressione. Se il CHECK
    // divergesse, la UI proporrebbe stati che il DB rifiuta.
    const check = sql.match(/acqualatina_misuratori_rimossi_stato_check[\s\S]*?\)\)/i)?.[0] ?? '';
    const nelDb = [...check.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(nelDb).toEqual([...STATI_MISURATORE]);
  });

  it('non porta i campi che il committente ha escluso dal registro', () => {
    // Lettura del vecchio contatore e calibro restano su rapportino e intervento.
    // Il PDR è gas: un misuratore d'acqua non ne ha uno.
    const create = sql.match(/CREATE TABLE IF NOT EXISTS public\.acqualatina_misuratori_rimossi[\s\S]*?\n\);/i)?.[0] ?? '';
    expect(create).not.toMatch(/\blettura\w*/i);
    expect(create).not.toMatch(/\bdiametro\b|\bcalibro\b/i);
    expect(create).not.toMatch(/^\s*pdr\b/im);
  });

  it("porta i campi che servono al magazzino: chi, quando, dove, quale matricola", () => {
    for (const c of ['data_esecuzione', 'esecutore', 'indirizzo', 'comune', 'matricola']) {
      expect(sql).toMatch(new RegExp(`^\\s*${c}\\s`, 'm'));
    }
    expect(sql).toMatch(/matricola\s+text\s+NOT NULL/i);
    expect(sql).toMatch(/data_esecuzione date\s+NOT NULL/i);
  });

  it("l'unicità su intervento_id rende idempotente il rinvio di un rapportino", () => {
    // L'upsert in app/api/r/[token]/invia usa onConflict: 'intervento_id'.
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*?\(intervento_id\)/i);
    expect(sql).toMatch(/WHERE intervento_id IS NOT NULL/i);
  });

  it('RLS attiva, scrittura al solo service role', () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/FOR SELECT TO authenticated USING \(true\)/i);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });
});

describe('registro misuratori AcquaLatina — modulo', () => {
  it('è registrato in moduleAccess e riservato agli admin', () => {
    const def = APP_MODULES.find((m) => m.key === 'acqualatina');
    expect(def).toBeDefined();
    expect(def?.href).toBe('/hub/acqualatina');
    expect(def?.adminOnly).toBe(true);
    expect(def?.matchPrefixes).toContain('/hub/acqualatina');
  });

  it('il prefisso non cattura le rotte del registro ACEA e viceversa', () => {
    const acqua = APP_MODULES.find((m) => m.key === 'acqualatina')!;
    const acea = APP_MODULES.find((m) => m.key === 'misuratori')!;
    expect(acqua.matchPrefixes!.some((p) => '/hub/misuratori'.startsWith(p))).toBe(false);
    expect(acea.matchPrefixes!.some((p) => '/hub/acqualatina/misuratori'.startsWith(p))).toBe(false);
  });
});
