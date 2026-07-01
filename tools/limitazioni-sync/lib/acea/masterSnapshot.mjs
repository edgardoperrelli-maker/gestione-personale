// PURO: mappa le righe grezze del master (mappaRigheMaster) allo snapshot inviato all'app per
// l'audit a tre vie (acea_master_snapshot). Scarta gli ODL vuoti; campi mancanti → stringa vuota.
// Riusato per DUNNING e ZAGAROLO (limitazioni massive).
export function mappaMasterSnapshot(grezze) {
  return (grezze ?? [])
    .filter((g) => String(g?.odl ?? '').trim())
    .map((g) => ({
      odl: String(g.odl).trim(),
      attivita: g.attivita ?? '',
      esecutore: g.esecutore ?? '',
      dataRaw: g.dataRaw ?? '',
      statoRaw: g.statoRaw ?? '',
      matricola: g.matricola ?? '',
      comune: g.comune ?? '',
      esito: g.esito ?? '', // ZAGAROLO
      saracinesca: g.saracinesca ?? '', // ZAGAROLO (SI)
      odlSaracinesca: g.odlSaracinesca ?? '', // ZAGAROLO (ODL figlio)
    }));
}
