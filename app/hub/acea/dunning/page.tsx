import { gatePagina } from '@/lib/auth/gatePagina';
import { AceaNav } from '@/components/modules/acea/AceaNav';
import DunningClient from '@/components/modules/acea/DunningClient';

export const dynamic = 'force-dynamic';

/**
 * Dunning: pianificazione degli interventi e scadenze.
 *
 * Import, rapportini, export e saracinesche stanno in `/hub/acea/strumenti`: qui resta la sola
 * tabella, così la pianificazione occupa lo schermo invece di stare in mezzo a una colonna alta
 * due schermate.
 *
 * Modulo a SCHERMO PIENO (DESIGN.md §8): `h-[calc(100dvh-6rem)]` sconta la cornice verticale della
 * shell — header 57px + `py-4`×2 = 89px ≈ 6rem. Da qui in giù è tutto flex: la tabella prende
 * l'altezza che avanza invece di calcolarla. Prima la scontava a mano (`100dvh - 22rem`) e il conto
 * era corto di un'ottantina di pixel, quindi la pagina scorreva per mostrare una tabella che a sua
 * volta scorreva; e ogni ritocco alla testa avrebbe richiesto di riaggiornare quel numero.
 */
export default async function AceaDunningPage() {
  const { adminPlus } = await gatePagina('/hub/acea/dunning');
  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-2">
      <AceaNav attivo="dunning" />
      {/* Il permesso viaggia dal server: `DunningClient` è client, la sessione non ce l'ha. */}
      <DunningClient anagraficaModificabile={adminPlus} />
    </div>
  );
}
