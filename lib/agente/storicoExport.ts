// Parser difensivo del `dettaglio` (jsonb) di un giro agente, per la tabella
// dello storico e per l'export Excel. Il dettaglio arriva come `unknown`
// (shape decisa dall'agente): qui lo si normalizza in righe piatte.

export type RigaModificata = {
  file: string;
  riga: number | '';
  tipo: string; // 'aggiornata' | 'extra'
  comune: string;
  odl: string;
  matricola: string;
  via: string;
  esecutore: string;
  esito: string;
  sigillo: string;
  data: string;
  saracinesca: string;
  note: string;
};

export type ConflittoRiga = {
  file: string;
  riga: number | '';
  odl: string;
  matricola: string;
  campo: string;
  esistente: string;
  nuovo: string;
};

export type NonCollocata = {
  comune: string;
  matricola: string;
  esecutore: string;
  motivo: string;
};

function s(v: unknown): string {
  return v == null ? '' : String(v);
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** Righe che l'agente ha toccato (pianificate aggiornate + extra aggiunte), con il file di provenienza. */
export function righeModificate(dettaglio: unknown): RigaModificata[] {
  const d = asObj(dettaglio);
  const out: RigaModificata[] = [];
  for (const f of asArray(d.file)) {
    const fo = asObj(f);
    const file = s(fo.file);
    for (const r of asArray(fo.righe)) {
      const ro = asObj(r);
      out.push({
        file,
        riga: typeof ro.riga === 'number' ? ro.riga : '',
        tipo: s(ro.tipo),
        comune: s(ro.comune),
        odl: s(ro.odl),
        matricola: s(ro.matricola),
        via: s(ro.via),
        esecutore: s(ro.esecutore),
        esito: s(ro.esito),
        sigillo: s(ro.sigillo),
        data: s(ro.data),
        saracinesca: s(ro.saracinesca),
        note: s(ro.note),
      });
    }
  }
  return out;
}

/** Conflitti (celle già compilate con valore diverso) per file. */
export function conflittiRighe(dettaglio: unknown): ConflittoRiga[] {
  const d = asObj(dettaglio);
  const out: ConflittoRiga[] = [];
  for (const f of asArray(d.file)) {
    const fo = asObj(f);
    const file = s(fo.file);
    for (const c of asArray(fo.conflitti)) {
      const co = asObj(c);
      out.push({
        file,
        riga: typeof co.riga === 'number' ? co.riga : '',
        odl: s(co.odl),
        matricola: s(co.matricola),
        campo: s(co.campo),
        esistente: s(co.esistente),
        nuovo: s(co.nuovo),
      });
    }
  }
  return out;
}

/** Lavori non collocati: extra senza file del comune + comuni dei lavori senza file master. */
export function nonCollocate(dettaglio: unknown): NonCollocata[] {
  const d = asObj(dettaglio);
  const out: NonCollocata[] = [];
  for (const e of asArray(d.extraNonCollocate)) {
    const eo = asObj(e);
    out.push({
      comune: s(eo.comune),
      matricola: s(eo.matricola),
      esecutore: s(eo.esecutore),
      motivo: 'comune senza file',
    });
  }
  for (const c of asArray(d.comuniNonAgganciati)) {
    out.push({ comune: s(c), matricola: '', esecutore: '', motivo: 'comune non agganciato' });
  }
  return out;
}
