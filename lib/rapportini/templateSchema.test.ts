import { describe, it, expect } from 'vitest';
import { TemplateSchema } from './templateSchema';
import { INFO_CAMPI_DISPONIBILI } from '@/utils/rapportini/infoCampi';

const base = {
  nome: 'Template',
  campi: [{ chiave: 'eseguito', etichetta: 'Eseguito', tipo: 'crocetta', ordine: 1 }],
};

describe('TemplateSchema', () => {
  it('accetta info_campi con il campo COORDINATE', () => {
    const r = TemplateSchema.safeParse({
      ...base,
      info_campi: [{ chiave: 'coordinate', etichetta: 'COORDINATE', ordine: 1 }],
    });
    expect(r.success).toBe(true);
  });

  it('accetta titolo_campi con coordinate', () => {
    const r = TemplateSchema.safeParse({ ...base, titolo_campi: ['coordinate'] });
    expect(r.success).toBe(true);
  });

  it('accetta TUTTI i campi info disponibili (no drift con InfoChiave)', () => {
    const info_campi = INFO_CAMPI_DISPONIBILI.map((c, i) => ({
      chiave: c.chiave, etichetta: c.etichettaDefault, ordine: i + 1,
    }));
    const r = TemplateSchema.safeParse({ ...base, info_campi });
    expect(r.success).toBe(true);
  });

  it('rifiuta una chiave info sconosciuta', () => {
    const r = TemplateSchema.safeParse({
      ...base,
      info_campi: [{ chiave: 'pippo', etichetta: 'P', ordine: 1 }],
    });
    expect(r.success).toBe(false);
  });
});
