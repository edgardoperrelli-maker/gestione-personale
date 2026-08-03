import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Il lavoro entrato dal «+» spariva in due modi diversi, scoperti insieme il 03/08.
 * Questi test presidiano le due correzioni sul lato database: sono invarianti di schema, e
 * un `db push` da zero deve riprodurle o i difetti tornano silenziosamente.
 */

const radice = resolve(__dirname, '../../..');
const leggi = (p: string) => readFileSync(resolve(radice, p), 'utf8');

const FK_RICHIESTE = leggi('supabase/migrations/20260803210000_interventi_manuali_sopravvivono_al_rapportino.sql');
const ORIGINE_VOCI = leggi('supabase/migrations/20260803220000_voci_manuali_origine_e_guardia.sql');
const NASCITA_MANUALI = leggi('supabase/migrations/20260606000000_interventi_manuali.sql');

describe('le richieste manuali sopravvivono al rapportino', () => {
  it('rifà la foreign key verso rapportini in SET NULL', () => {
    expect(FK_RICHIESTE).toMatch(/drop constraint if exists interventi_manuali_rapportino_id_fkey/);
    expect(FK_RICHIESTE).toMatch(
      /add constraint interventi_manuali_rapportino_id_fkey[\s\S]*references public\.rapportini\(id\) on delete set null/,
    );
  });

  it('corregge proprio il CASCADE con cui la tabella era nata', () => {
    // Se questa asserzione cade, la 20260606000000 è stata riscritta: allora la correzione
    // qui sopra è diventata un doppione, oppure il difetto è rientrato dalla porta principale.
    expect(NASCITA_MANUALI).toMatch(/rapportino_id uuid references rapportini\(id\) on delete cascade/);
  });
});

describe('le voci del + non si mascherano da voci del motore', () => {
  it('riallinea le voci manuali rimaste con origine di default', () => {
    expect(ORIGINE_VOCI).toMatch(/update public\.rapportino_voci[\s\S]*set origine = 'manuale'[\s\S]*manuale = true[\s\S]*origine = 'task'/);
  });

  it('vieta a livello di database che una voce manuale si dichiari task', () => {
    // È la guardia: senza, basta un terzo costruttore che dimentica `origine` per riaprire
    // la falla — e la si scopre solo giorni dopo, da un rapportino che ha perso delle voci.
    expect(ORIGINE_VOCI).toMatch(/rapportino_voci_manuale_non_task_check/);
    expect(ORIGINE_VOCI).toMatch(/check \(not \(manuale and origine = 'task'\)\)/);
  });

  it('resta idempotente: non ricrea un vincolo già presente', () => {
    expect(ORIGINE_VOCI).toMatch(/if not exists \([\s\S]*from pg_constraint/);
  });
});
