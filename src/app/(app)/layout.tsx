import BottomNav from '@/components/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Green header banner */}
      <header className="bg-gradient-to-br from-emerald-700 to-emerald-900 px-5 pb-5 pt-7 text-white max-w-lg mx-auto w-full">
        <div className="text-2xl mb-1">🎯</div>
        <h1 className="text-xl font-extrabold leading-tight">Habit Tracker</h1>
        <p className="text-sm text-emerald-100/80 mt-0.5">
          {new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </header>

      <main className="flex-1 pb-24 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
