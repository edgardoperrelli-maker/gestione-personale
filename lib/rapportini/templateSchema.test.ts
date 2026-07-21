import { describe, it, expect } from 'vitest';
import { CampoSchema, TemplateSchema } from './templateSchema';
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

describe('CampoSchema scope_foto', () => {
  it('accetta scope_foto valido', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1, scope_foto: 'misuratore' }).success).toBe(true);
  });
  it('rifiuta scope_foto fuori enum', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1, scope_foto: 'xxx' }).success).toBe(false);
  });
  it('scope_foto opzionale (assente ok)', () => {
    expect(CampoSchema.safeParse({ chiave: 'f', etichetta: 'Foto', tipo: 'foto', ordine: 1 }).success).toBe(true);
  });
});

describe('TemplateSchema tipo', () => {
  it('default standard se assente', () => {
    const r = TemplateSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('standard');
  });
  it('accetta tipo risanamento', () => {
    const r = TemplateSchema.safeParse({ ...base, tipo: 'risanamento' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tipo).toBe('risanamento');
  });
  it('rifiuta tipo fuori enum', () => {
    expect(TemplateSchema.safeParse({ ...base, tipo: 'altro' }).success).toBe(false);
  });
});

describe('CampoSchema obbligatoria_se (foto condizionali)', () => {
  const base = { chiave: 'foto_saracinesca', etichetta: 'FOTO SARACINESCA', tipo: 'foto', ordine: 1 };
  it('accetta la condizione configurata', () => {
    expect(CampoSchema.safeParse({ ...base, obbligatoria_se: { chiave: 'saracinesca', valore: 'SI' } }).success).toBe(true);
  });
  it('accetta null (condizione rimossa) e il campo assente', () => {
    expect(CampoSchema.safeParse({ ...base, obbligatoria_se: null }).success).toBe(true);
    expect(CampoSchema.safeParse(base).success).toBe(true);
  });
  it('rifiuta condizioni monche (chiave o valore vuoti)', () => {
    expect(CampoSchema.safeParse({ ...base, obbligatoria_se: { chiave: '', valore: 'SI' } }).success).toBe(false);
    expect(CampoSchema.safeParse({ ...base, obbligatoria_se: { chiave: 'saracinesca', valore: '' } }).success).toBe(false);
  });
});
