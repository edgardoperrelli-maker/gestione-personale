// utils/rapportini/condividiFile.ts
export type EsitoCondivisione = 'shared' | 'downloaded' | 'cancelled';

export interface NavShareLike {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

/** Vero se il dispositivo può condividere file via Web Share API. Puro: testabile con un finto navigator. */
export function supportaCondivisioneFile(nav: NavShareLike, file: Blob): boolean {
  return typeof nav.share === 'function'
    && typeof nav.canShare === 'function'
    && nav.canShare({ files: [file as File] });
}

function scarica(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Prova la condivisione nativa del file; altrimenti scarica. Annullo utente → 'cancelled'. */
export async function condividiOScarica(opts: {
  blob: Blob;
  filename: string;
  title: string;
  text: string;
}): Promise<EsitoCondivisione> {
  const { blob, filename, title, text } = opts;
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (supportaCondivisioneFile(navigator, file)) {
    try {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // altri errori → ripiega sul download
    }
  }
  scarica(blob, filename);
  return 'downloaded';
}
