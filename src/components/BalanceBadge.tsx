'use client'

import { useEffect, useState } from 'react'
import { fetchMoneySnapshot } from '@/lib/moneySnapshot'

export default function BalanceBadge() {
  const [balance, setBalance] = useState<number | null>(null)
  const [symbol, setSymbol] = useState('S$')

  useEffect(() => {
    async function fetchBalance() {
      const snap = await fetchMoneySnapshot()
      if (!snap) return
      setSymbol(snap.cfg.currencySymbol ?? 'S$')
      setBalance(snap.balance)
    }

    fetchBalance()

    // The badge sits in the layout, so it never remounts while moving between
    // tabs. The Rewards page fires this after a redemption or a credit change,
    // and the check-in page after Save Check-In, so the amount stays right
    // without a full page reload.
    const onBalanceChange = (e: StorageEvent) => { if (e.key === 'balance') fetchBalance() }
    window.addEventListener('storage', onBalanceChange)
    return () => window.removeEventListener('storage', onBalanceChange)
  }, [])

  if (balance === null) return null

  return (
    <div className={`rounded-full px-3 py-1 ${balance < 0 ? 'bg-red-500/70' : 'bg-white/20'}`}>
      <span className="text-white font-bold text-sm">
        {balance < 0 ? '−' : ''}{symbol}{Math.abs(balance).toFixed(2)}
      </span>
    </div>
  )
}
