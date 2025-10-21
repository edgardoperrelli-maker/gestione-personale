
export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <nav className="border-b">
        <div className="mx-auto max-w-6xl p-4 text-sm opacity-80">Hub</div>
      </nav>
      {children}
    </div>
  )
}
