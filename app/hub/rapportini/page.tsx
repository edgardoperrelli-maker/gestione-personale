import Link from 'next/link'
import AuthGate from '@/components/AuthGate'

export const dynamic = 'force-dynamic'

export default function RapportiniHubPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-3xl font-semibold mb-6">Generazione Rapportini</h1>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/hub/rapportini/massiva" className="block rounded-2xl border p-5 shadow-sm hover:shadow transition">
            <h2 className="text-xl font-medium mb-2">Genera Rapportino Massiva</h2>
            <p className="text-sm opacity-70">Crea più rapportini in un’unica operazione.</p>
          </Link>

          <Link href="/hub/rapportini/clientela" className="block rounded-2xl border p-5 shadow-sm hover:shadow transition">
            <h2 className="text-xl font-medium mb-2">Genera Rapportino Clientela</h2>
            <p className="text-sm opacity-70">Schermata e logica come nel file VBA.</p>
          </Link>
        </div>
      </main>
    </AuthGate>
  )
}
