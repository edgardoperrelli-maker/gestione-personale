import { STATO_COLOR, STATO_LABEL, type StatoMisuratore } from '@/types/misuratori';

export default function StatoBadge({ stato }: { stato: StatoMisuratore }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATO_COLOR[stato]}`}
    >
      {STATO_LABEL[stato] ?? stato}
    </span>
  );
}
