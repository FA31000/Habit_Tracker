import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// Called by Vercel Cron every minute — checks who has their reminder set to now
export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron (not a random visitor)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Current time in Singapore (UTC+8)
  const now = new Date()
  const sgHour = (now.getUTCHours() + 8) % 24
  const sgMinute = now.getUTCMinutes()
  const currentTime = `${String(sgHour).padStart(2, '0')}:${String(sgMinute).padStart(2, '0')}`

  // Use service role key to bypass RLS for cron reads
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find users whose reminder time matches now
  const { data: settings } = await supabase
    .from('user_settings')
    .select('user_id')
    .eq('reminder_time', currentTime)

  if (!settings || settings.length === 0) {
    return NextResponse.json({ sent: 0, time: currentTime })
  }

  const userIds = settings.map(s => s.user_id)

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('user_id, subscription')
    .in('user_id', userIds)
    .eq('role', 'user')

  let sent = 0
  const payload = JSON.stringify({
    title: 'Habit Tracker',
    body: "Time to check in on your habits! 🎯",
    url: '/',
  })

  for (const row of (subs ?? [])) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription), payload)
      sent++
    } catch {
      await supabase.from('push_subscriptions').delete().eq('subscription', row.subscription)
    }
  }

  return NextResponse.json({ sent, time: currentTime })
}
