'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type BookingEntry = {
  id: string;
  date: string;
  hotel_name: string;
  territory: string;
  room_type: string;
  room_price: number;
};

export default function StoricoTrasferte({ staffId }: { staffId: string }) {
  const [bookings, setBookings] = useState<BookingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase
        .from('hotel_bookings')
        .select('id, date, hotel_name, territory, room_type, room_price')
        .contains('guests', [{ id: staffId }])
        .order('date', { ascending: false })
        .limit(20);

      if (!alive) return;
      setBookings((data ?? []) as BookingEntry[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [staffId]);

  if (loading) {
    return <div className="mt-4 text-xs italic text-[var(--brand-text-muted)]">Caricamento storico trasferte...</div>;
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-muted)]">
        Storico trasferte {bookings.length > 0 ? `(ultime ${bookings.length})` : ''}
      </p>
      {bookings.length === 0 ? (
        <p className="text-xs text-[var(--brand-text-muted)]">Nessuna trasferta registrata.</p>
      ) : (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {bookings.map((booking) => (
            <div key={booking.id} className="flex items-center gap-3 rounded-xl border border-[var(--brand-border)] bg-white px-3 py-2 text-xs">
              <span className="w-20 flex-shrink-0 font-semibold">
                {new Date(`${booking.date}T00:00:00`).toLocaleDateString('it-IT')}
              </span>
              <span className="w-20 flex-shrink-0 text-[var(--brand-text-muted)]">{booking.territory}</span>
              <span className="flex-1 truncate font-medium">{booking.hotel_name}</span>
              <span className="flex-shrink-0 text-[var(--brand-text-muted)]">{booking.room_type}</span>
              <span className="flex-shrink-0 font-semibold">EUR {Number(booking.room_price).toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
