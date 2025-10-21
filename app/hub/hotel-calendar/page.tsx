// app/hub/hotel-calendar/page.tsx
import AuthGate from '@/components/AuthGate'

export default function HotelCalendarPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Calendario prenotazioni Hotel</h1>
        <div className="rounded-2xl border p-4">TODO: vista calendario prenotazioni.</div>
      </main>
    </AuthGate>
  )
}
