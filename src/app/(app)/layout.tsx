import BottomNav from '@/components/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Green header banner */}
      <header className="bg-gradient-to-br from-emerald-700 to-emerald-900 px-5 pb-3 pt-5 text-white max-w-lg mx-auto w-full">
        <h1 className="text-xl font-extrabold leading-tight">Habit Tracker</h1>
      </header>

      <main className="flex-1 pb-24 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
