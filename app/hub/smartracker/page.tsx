// app/hub/smartracker/page.tsx
import AuthGate from '@/components/AuthGate'

export default function SmarTrackerPage() {
  return (
    <AuthGate>
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-2xl font-semibold mb-4">SmarTracker</h1>
        <div className="rounded-2xl border p-4">TODO: dashboard tracciamento.</div>
      </main>
    </AuthGate>
  )
}
