import BottomNav from '@/components/BottomNav'
import BalanceBadge from '@/components/BalanceBadge'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-900 px-5 pb-3 pt-4 text-white max-w-lg mx-auto w-full">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-6 -right-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute top-4 -right-2 h-14 w-14 rounded-full bg-emerald-400/20" />
        <div className="pointer-events-none absolute -bottom-8 -left-4 h-24 w-24 rounded-full bg-teal-400/10" />

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌱</span>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none">Habit Tracker</h1>
              <p className="text-emerald-200/80 text-xs font-medium mt-0.5">Build the new FA</p>
            </div>
          </div>
          <div className="mr-24"><BalanceBadge /></div>
        </div>
      </header>

      <main className="flex-1 pb-24 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
