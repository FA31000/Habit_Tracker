import Link from 'next/link'
import BottomNav from '@/components/BottomNav'
import BalanceBadge from '@/components/BalanceBadge'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let name = 'you'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()
    name = profile?.display_name?.trim() || user.email?.split('@')[0] || 'you'
  }

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
              <p className="text-emerald-200/80 text-xs font-medium mt-0.5">Build the new {name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="mr-8"><BalanceBadge /></div>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.48.48 0 0 0 13.4 2h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L1.71 8.47a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-24 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
