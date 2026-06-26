'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',         icon: '✅', label: 'Check In' },
  { href: '/habits',   icon: '📋', label: 'Habits'   },
  { href: '/stats',    icon: '📊', label: 'Stats'    },
  { href: '/rewards',  icon: '🎁', label: 'Rewards'  },
  { href: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function BottomNav() {
  const path = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto flex">
        {tabs.map(tab => {
          const active = path === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-xs font-medium transition ${
                active ? 'text-emerald-700' : 'text-gray-400'
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
