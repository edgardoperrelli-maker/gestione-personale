import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CampoSchema, InfoCampoSchema } from '@/lib/rapportini/templateSchema';

const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260727130000_acqualatina_commessa.sql'),
  'utf8',
);

/** Corpo della `add constraint <nome> …;` (non della `drop constraint` omonima). */
function addConstraint(nome: string): string {
  const m = sql.match(new RegExp(`add constraint ${nome}[\\s\\S]*?;`, 'i'));
  expect(m, `add constraint non trovato: ${nome}`).not.toBeNull();
  return m![0];
}

/** Tutti i literal jsonb array della migration, già parsati. */
const JSON_LITERALS: unknown[][] = [...sql.matchAll(/'(\[[\s\S]*?\])'::jsonb/g)]
  .map((m) => JSON.parse(m[1]) as unknown[]);

/** Il literal jsonb array che contiene un oggetto con la `chiave` data. */
function arrayConChiave(chiave: string): Array<Record<string, unknown>> {
  const trovato = JSON_LITERALS.find(
    (arr) => arr.some((o) => (o as { chiave?: unknown } | null)?.chiave === chiave),
  );
  expect(trovato, `nessun array jsonb con chiave "${chiave}"`).toBeDefined();
  return trovato as Array<Record<string, unknown>>;
}

describe('migrazione commessa acqualatina', () => {
  it('apre il committente sulle tre tabelle operative senza perdere i preesistenti', () => {
    const tassonomia = addConstraint('attivita_tassonomia_committente_check');
    expect(tassonomia).toContain("'acqualatina'");
    // lim_massive è un marcatore di canale di interventi: in tassonomia non esiste.
    expect(tassonomia).not.toContain("'lim_massive'");
    for (const c of ['acea', 'italgas', 'altro']) expect(tassonomia).toContain(`'${c}'`);

    for (const t of ['interventi_committente_check', 'interventi_manuali_committente_check']) {
      const corpo = addConstraint(t);
      for (const c of ['acea', 'italgas', 'altro', 'lim_massive', 'acqualatina']) {
        expect(corpo, t).toContain(`'${c}'`);
      }
    }
  });

  it('censisce le descrizioni sotto il gruppo unico della commessa, in modo idempotente', () => {
    expect(sql).toContain("'SOSTITUZIONE MISURATORI'");
    expect(sql).toContain("('Sostituzione misuratore')");
    expect(sql).toContain("('Sostituzione misuratori')");
    expect(sql.match(/where not exists/gi) ?? []).toHaveLength(2); // tassonomia + flusso
  });

  it("il flusso è 'standard': un 'risanamento' dirotterebbe il risanamento colonne Italgas", () => {
    expect(sql).toMatch(/^\s*'standard',$/m);
    expect(sql).not.toMatch(/^\s*'risanamento',$/m);
  });

  it('le 6 azioni sono nell\'ordine deciso e valide per lo schema del template', () => {
    const campi = arrayConChiave('eseguito');
    for (const c of campi) expect(() => CampoSchema.parse(c)).not.toThrow();
    expect(campi.map((c) => c.chiave)).toEqual([
      'eseguito', 'motivo_non_eseguito', 'lettura_vecchio', 'codoli', 'saracinesca', 'note',
    ]);
    expect(campi.find((c) => c.chiave === 'eseguito')).toMatchObject({
      tipo: 'select', opzioni: ['SI', 'NO'], obbligatoria: true,
    });
    // Nessuna foto: deciso con il committente.
    expect(campi.some((c) => c.tipo === 'foto')).toBe(false);
  });

  it("solo il motivo è un campo 'negativo': gli extra non devono falsare l'esito", () => {
    const campi = arrayConChiave('eseguito');
    const NEG_NAME = /assent|non[\s_-]*eseguit|negativ|\bko\b/i; // utils/rapportini/voceColore.ts
    const negativi = campi.filter((c) => NEG_NAME.test(`${c.chiave} ${c.etichetta}`));
    expect(negativi.map((c) => c.chiave)).toEqual(['motivo_non_eseguito']);
    // 'eseguito' è il select d'esito riconosciuto dal motore (ESITO_SELECT_NAME).
    expect(/esegu|esito/i.test('eseguito')).toBe(true);
  });

  it("l'anagrafica include il calibro ed è valida per lo schema", () => {
    const info = arrayConChiave('matricola');
    for (const c of info) expect(() => InfoCampoSchema.parse(c)).not.toThrow();
    expect(info.map((c) => c.chiave)).toContain('diametro');
  });

  it('collega il flusso alla foglia acqualatina', () => {
    expect(sql).toMatch(/'acqualatina', array\['SOSTITUZIONE MISURATORI'\]/);
  });
});
