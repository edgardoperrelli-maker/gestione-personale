import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CampoSchema } from '@/lib/rapportini/templateSchema';

/**
 * Forma della migration che aggiunge l'azione «MATRICOLA NUOVO MISURATORE» al flusso
 * AcquaLatina. Il DB non è raggiungibile dai test: si controlla il TESTO della migration,
 * cioè le tre proprietà che, se saltano, saltano in silenzio — il campo prodotto valido per
 * lo schema del template, la chirurgia sul jsonb (niente riscrittura dell'array) e
 * l'idempotenza.
 */
const sql = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20260803160000_acqualatina_matricola_nuova.sql'),
  'utf8',
);

/** Valore stringa di una coppia `'chiave', 'valore'` dentro il jsonb_build_object. */
const valore = (k: string): string | undefined =>
  sql.match(new RegExp(`'${k}',\\s*'([^']*)'`))?.[1];

describe('migrazione matricola nuova (flusso AcquaLatina)', () => {
  it('costruisce un campo VALIDO per lo schema del template', () => {
    const campo = {
      chiave: valore('chiave'),
      etichetta: valore('etichetta'),
      tipo: valore('tipo'),
      obbligatoria: true,
      obbligatoria_se: null,
      ordine: 4, // in SQL è `o.ordine`: qui basta un intero per validare la forma
    };
    expect(campo.chiave).toBe('matricola_nuova');
    expect(campo.tipo).toBe('matricola');
    expect(campo.etichetta).toBe('MATRICOLA NUOVO MISURATORE');
    // Il controllo che conta: se il tipo venisse rinominato senza toccare lo zod dell'API,
    // l'ufficio non potrebbe più salvare il flusso da «Azioni operatori».
    expect(CampoSchema.safeParse(campo).success).toBe(true);
  });

  it('è obbligatoria: senza `obbligatoria` il campo sarebbe un promemoria, non un\'azione', () => {
    expect(sql).toMatch(/'obbligatoria',\s*true/);
  });

  it('colpisce SOLO il flusso della commessa', () => {
    expect(sql).toContain("t.gruppo_committente = 'acqualatina'");
    expect(sql).toContain("upper(g) = 'SOSTITUZIONE MISURATORI'");
  });

  it('è idempotente: con la chiave già presente non tocca niente', () => {
    expect(sql).toMatch(/not exists[\s\S]*?'matricola_nuova'/);
  });

  it('NON riscrive l\'array dei campi: le correzioni fatte a mano in produzione restano', () => {
    // Un `set campi = '[…]'::jsonb` cancellerebbe, fra le altre, la SARACINESCA convertita
    // da crocetta a select dalla 20260727160000.
    expect(sql).not.toMatch(/set\s+campi\s*=\s*'\[/i);
    expect(sql).toContain('jsonb_array_elements');
  });

  it('scala di uno le azioni successive: niente due campi con lo stesso ordine', () => {
    expect(sql).toMatch(/jsonb_set\(e,\s*'\{ordine\}'/);
    expect(sql).toMatch(/\(e->>'ordine'\)::int \+ 1/);
  });
});
