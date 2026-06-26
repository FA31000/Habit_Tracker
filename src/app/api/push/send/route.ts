import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  const { user_id, role, title, body, url } = await req.json()

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', user_id)
    .eq('role', role)

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0 })
  }

  const payload = JSON.stringify({ title, body, url: url || '/' })
  let sent = 0

  for (const row of subs) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription), payload)
      sent++
    } catch {
      // Subscription expired — remove it
      await supabase.from('push_subscriptions')
        .delete()
        .eq('subscription', row.subscription)
    }
  }

  return NextResponse.json({ sent })
}
