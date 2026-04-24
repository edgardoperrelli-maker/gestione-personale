'use client';

import { useRouter } from 'next/navigation';
import Button from '@/components/Button';

type Props = {
  fallbackHref?: string;
};

export default function SopralluoghiBackButton({
  fallbackHref = '/hub',
}: Props) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  return (
    <Button
      variant="outline"
      size="md"
      onClick={handleClick}
    >
      Torna indietro
    </Button>
  );
}
