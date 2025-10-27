import AuthGate from '@/components/AuthGate'

export const dynamic = 'force-dynamic'

export default function RapportinoMassivaPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold mb-4">Genera Rapportino Massiva</h1>
        <div className="rounded-2xl border p-6 shadow-sm">
          Stiamo lavorando per te
        </div>
      </main>
    </AuthGate>
  )
}
