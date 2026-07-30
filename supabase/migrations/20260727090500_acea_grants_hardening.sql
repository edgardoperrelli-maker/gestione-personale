-- ============================================================================
-- MODULO ACEA — hardening dei privilegi sulle tabelle del registro
-- ============================================================================
-- Correttiva per i database su cui la 20260727090000 è stata applicata nella sua prima forma,
-- che revocava solo insert/update/delete.
--
-- Il problema: i default di Supabase concedono al ruolo `authenticated` anche TRUNCATE, TRIGGER
-- e REFERENCES. **TRUNCATE non passa da RLS**: nessuna policy lo intercetta, e da solo basta a
-- svuotare `acea_ordini`. Revocare il trio insert/update/delete lasciava quindi aperta la strada
-- più distruttiva.
--
-- Idempotente: su un DB creato con la 20260727090000 già corretta non cambia nulla.

revoke all on table public.acea_ordini        from authenticated, anon;
revoke all on table public.acea_ordini_eventi from authenticated, anon;
revoke all on table public.acea_impianti      from authenticated, anon;
revoke all on table public.acea_import        from authenticated, anon;

grant select on public.acea_ordini        to authenticated;
grant select on public.acea_ordini_eventi to authenticated;
grant select on public.acea_import        to authenticated;
grant select on public.acea_impianti      to authenticated;

-- L'unica scrittura consentita dall'app: le colonne della verifica indirizzo.
grant update (indirizzo_verificato, verificato_da, verificato_il, note_verifica)
  on public.acea_impianti to authenticated;
