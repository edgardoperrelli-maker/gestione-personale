-- supabase/migrations/20260720151000_backfill_gruppo_attivita.sql
-- Backfill dello storico secondo la tassonomia (spec §4). Idempotente.
-- ORDINE OBBLIGATO: prima i fix committente (con clone alias), POI gruppo+canonica,
-- così il lookup usa il committente corretto.

-- ── Passo A: clona gli alias per i committente che stanno per cambiare ──────────────
-- Lo strato produzione economica (lib/produzione/attivitaCanonica.ts) risolve per
-- (committente_orig, chiave). Cambiando committente acea→italgas su righe interventi,
-- la coppia cercata diventa (italgas, chiave): se l'alias esiste solo come (acea, chiave)
-- la risoluzione degraderebbe a fallback (macrogruppo perso). Cloniamo PRIMA.
insert into acea_attivita_alias (committente_orig, chiave, committente_eff, macrogruppo, attivita_pulita, voce, attivo, note)
select 'italgas', a.chiave, a.committente_eff, a.macrogruppo, a.attivita_pulita, a.voce, a.attivo,
       'clone da acea per riclassificazione committente (migration 20260720151000)'
from acea_attivita_alias a
where a.committente_orig = 'acea'
  and a.chiave in (
    select t.descrizione_norm from attivita_tassonomia t where t.committente = 'italgas'
  )
  and not exists (
    select 1 from acea_attivita_alias b
    where b.committente_orig = 'italgas' and b.chiave = a.chiave
  );

-- ── Passo B: correzione committente dove la tassonomia è univoca ────────────────────
-- Righe acea/altro la cui descrizione esiste SOLO sotto italgas (mai sotto acea):
-- il file di riferimento le riclassifica italgas. lim_massive NON si tocca (spec §4.5).
update interventi i
set committente = 'italgas'
where i.committente in ('acea', 'altro')
  and attivita_norm(i.intervento_tipo) <> ''
  and exists (
    select 1 from attivita_tassonomia t
    where t.committente = 'italgas' and t.descrizione_norm = attivita_norm(i.intervento_tipo) and t.attivo
  )
  and not exists (
    select 1 from attivita_tassonomia t
    where t.committente = 'acea' and t.descrizione_norm = attivita_norm(i.intervento_tipo) and t.attivo
  );

-- ── Passo C: gruppo_attivita + canonicalizzazione descrizione ───────────────────────
-- lim_massive usa la tassonomia acea (equivalenza di canale).
update interventi i
set gruppo_attivita = t.gruppo,
    intervento_tipo = t.descrizione
from attivita_tassonomia t
where t.attivo
  and t.descrizione_norm = attivita_norm(i.intervento_tipo)
  and t.committente = case when i.committente = 'lim_massive' then 'acea' else i.committente end
  and (i.gruppo_attivita is distinct from t.gruppo or i.intervento_tipo is distinct from t.descrizione);
