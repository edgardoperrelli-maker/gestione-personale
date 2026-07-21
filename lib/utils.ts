import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge condizionale di classi Tailwind (helper standard shadcn/ui).
 * Usato dai componenti in `@/components/ui` (es. mapcn `map.tsx`).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
