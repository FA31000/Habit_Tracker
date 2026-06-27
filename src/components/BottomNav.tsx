'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CheckInIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
)

const HabitsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C8 3 5 6.5 5 10c0 5 7 11 7 11s7-6 7-11c0-3.5-3-7-7-7z" />
    <path d="M12 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" fill="currentColor" stroke="none" />
  </svg>
)

const StatsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19V10" />
    <path d="M9 19V6" />
    <path d="M14 19v-5" />
    <path d="M19 19v-8" />
  </svg>
)

const RewardsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.8l-4.9 2.6.9-5.5L4 8.8l5.5-.8z" />
  </svg>
)

const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
)

const tabs = [
  { href: '/',         Icon: CheckInIcon,  label: 'Check In' },
  { href: '/habits',   Icon: HabitsIcon,   label: 'Habits'   },
  { href: '/stats',    Icon: StatsIcon,    label: 'Stats'    },
  { href: '/rewards',  Icon: RewardsIcon,  label: 'Rewards'  },
  { href: '/settings', Icon: SettingsIcon, label: 'Settings' },
]

export default function BottomNav() {
  const path = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-1px_12px_rgba(0,0,0,0.06)]">
      <div className="max-w-lg mx-auto flex">
        {tabs.map(({ href, Icon, label }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-3 gap-1 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
                active ? 'text-emerald-700' : 'text-gray-400'
              }`}
            >
              {active && (
                <span className="absolute -mt-3 w-6 h-0.5 rounded-full bg-emerald-600" />
              )}
              <Icon active={active} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
