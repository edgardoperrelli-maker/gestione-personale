import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Il registro accessi/azioni è nato per rispondere alla domanda «chi l'ha cancellato?», rimasta
 * senza risposta il 03/08/2026. Questi test difendono le due cose che, se cedono, la
 * rilascerebbero senza risposta di nuovo: la chiusura in lettura del registro e la leggibilità
 * dei nomi delle azioni.
 */

const radice = resolve(__dirname, '../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

const MIGRAZIONE = leggi('supabase/migrations/20260803190000_audit_azioni_e_accessi.sql');
const REGISTRA = leggi('lib/audit/registra.ts');
const CLIENT = leggi('app/impostazioni/log/LogClient.tsx');

describe('migrazione del registro', () => {
  it('crea la tabella delle azioni e la vista sugli accessi', () => {
    expect(MIGRAZIONE).toMatch(/create table if not exists public\.audit_azioni/);
    expect(MIGRAZIONE).toMatch(/create or replace view public\.audit_accessi/);
    expect(MIGRAZIONE).toMatch(/from auth\.audit_log_entries/);
  });

  it('lascia il registro leggibile al solo service_role', () => {
    // RLS senza policy nega tutto: solo il service_role, che la scavalca, entra.
    expect(MIGRAZIONE).toMatch(/alter table public\.audit_azioni enable row level security/);
    expect(MIGRAZIONE).not.toMatch(/create policy/i);
    // Supabase concede in automatico i privilegi sulle nuove tabelle di `public`: vanno tolti,
    // altrimenti un log di sicurezza sarebbe leggibile da qualunque utente autenticato.
    expect(MIGRAZIONE).toMatch(/revoke all on public\.audit_azioni from anon, authenticated/);
    expect(MIGRAZIONE).toMatch(/revoke all on public\.audit_accessi from anon, authenticated/);
  });

  it('indicizza la domanda "cosa è successo a questa entità"', () => {
    expect(MIGRAZIONE).toMatch(/audit_azioni_entita_idx[\s\S]*\(entita, entita_id/);
    expect(MIGRAZIONE).toMatch(/audit_azioni_occorso_idx/);
  });
});

describe('nomi delle azioni', () => {
  /** Estrae i valori dell'unione `NomeAzione` dichiarata in registra.ts. */
  function nomiAzione(): string[] {
    const blocco = REGISTRA.match(/export type NomeAzione\s*=([\s\S]*?);/);
    expect(blocco, 'unione NomeAzione non trovata in lib/audit/registra.ts').toBeTruthy();
    return [...blocco![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it('dichiara le azioni distruttive che hanno causato l\'incidente', () => {
    const nomi = nomiAzione();
    // Le tre vie per cui un rapportino può sparire senza che nessuno l'abbia chiesto.
    expect(nomi).toContain('piano.elimina');
    expect(nomi).toContain('piano.residuo.elimina');
    expect(nomi).toContain('rapportino.orfano.elimina');
  });

  it('ha un\'etichetta leggibile per ogni azione registrabile', () => {
    for (const nome of nomiAzione()) {
      expect(CLIENT, `manca l'etichetta per '${nome}' in ETICHETTE`).toContain(`'${nome}':`);
    }
  });

  it('segna come distruttive tutte le azioni che cancellano', () => {
    const distruttive = CLIENT.match(/const DISTRUTTIVE = new Set\(\[([\s\S]*?)\]\)/);
    expect(distruttive).toBeTruthy();
    const elencate = [...distruttive![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    for (const nome of nomiAzione()) {
      // `elimina`/`sostituisci` nel nome = l'azione distrugge dati: deve risaltare in rosso.
      if (/\.(elimina|rimuovi|sostituisci)$/.test(nome)) {
        expect(elencate, `'${nome}' distrugge dati ma non è in DISTRUTTIVE`).toContain(nome);
      }
    }
  });
});

describe('registrazione', () => {
  it('non fa mai fallire l\'operazione che sta registrando', () => {
    // Un log che rompe il salvataggio di un piano è peggio del log mancante.
    expect(REGISTRA).toMatch(/catch \(err\)[\s\S]*console\.error\('\[audit\] eccezione:'/);
    expect(REGISTRA).not.toMatch(/throw new Error/);
  });

  it('carica il client admin a richiesta, non all\'import', () => {
    // Altrimenti chi importa il registro (sincronizzaRapportini) esplode nei test unitari,
    // che girano senza chiavi Supabase.
    expect(REGISTRA).toMatch(/await import\('@\/lib\/supabaseAdmin'\)/);
    expect(REGISTRA).not.toMatch(/^import \{ supabaseAdmin \}/m);
  });
});
