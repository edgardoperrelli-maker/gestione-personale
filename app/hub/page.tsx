// app/hub/page.tsx
import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export const dynamic = 'force-dynamic'

export default function HubPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-3xl font-semibold mb-6">Hub</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/hub/hotel-calendar" className="block rounded-2xl border p-5 shadow-sm hover:shadow transition">
            <h2 className="text-xl font-medium mb-2">Calendario prenotazioni Hotel</h2>
            <p className="text-sm opacity-70">Gestisci prenotazioni e occupazione.</p>
          </Link>

          <Link href="/hub/operational-calendar" className="block rounded-2xl border p-5 shadow-sm hover:shadow transition">
            <h2 className="text-xl font-medium mb-2">Calendario operativo</h2>
            <p className="text-sm opacity-70">Pianifica turni e attività.</p>
          </Link>

          <Link href="/hub/smartracker" className="block rounded-2xl border p-5 shadow-sm hover:shadow transition">
            <h2 className="text-xl font-medium mb-2">SmarTracker</h2>
            <p className="text-sm opacity-70">Monitoraggio e tracciamento.</p>
          </Link>
        </div>
      </main>
    </AuthGate>
  )
}
