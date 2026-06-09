import { permanentRedirect } from 'next/navigation';

// La Torre di controllo è stata rinominata in "Live" (/hub/live).
// Redirect permanente per i preferiti già salvati.
export default function TorreRedirect() {
  permanentRedirect('/hub/live');
}
