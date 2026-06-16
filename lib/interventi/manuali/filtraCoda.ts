// PURA: estrazione dati anagrafici e filtro/ricerca della coda "in attesa".

function anagraficaDi(d: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const a = (d as { anagrafica?: unknown } | null | undefined)?.anagrafica;
  return a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
}

/** Via/matricola/ODL/attività di una riga coda: dati_correnti vince su dati_operatore. */
export function datiAnagraficaCoda(
  riga: { dati_correnti?: Record<string, unknown>; dati_operatore?: Record<string, unknown> },
): { via: string; matricola: string; odl: string; attivita: string } {
  const corr = anagraficaDi(riga.dati_correnti);
  const op = anagraficaDi(riga.dati_operatore);
  const pick = (k: string) => String((corr[k] ?? op[k]) ?? '').trim();
  return { via: pick('via'), matricola: pick('matricola'), odl: pick('odl'), attivita: pick('attivita') };
}

export type FiltriCoda = { ricerca: string; operatore: string; committente: string; attivita: string };

type RigaFiltrabile = {
  staff_id: string | null;
  committente: string;
  dati_correnti?: Record<string, unknown>;
  dati_operatore?: Record<string, unknown>;
};

/** Filtra la coda: AND tra operatore/committente/attività + ricerca substring su via/matricola/ODL. */
export function filtraCoda<T extends RigaFiltrabile>(righe: T[], f: FiltriCoda): T[] {
  const q = f.ricerca.trim().toLowerCase();
  return (righe ?? []).filter((r) => {
    if (f.operatore && r.staff_id !== f.operatore) return false;
    if (f.committente && r.committente !== f.committente) return false;
    const d = datiAnagraficaCoda(r);
    if (f.attivita && d.attivita !== f.attivita) return false;
    if (q) {
      const hay = `${d.via} ${d.matricola} ${d.odl}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
