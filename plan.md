# Habit Tracker App — Plan

## Context
The user wants a personal habit tracker that feels like a game. Daily check-ins, streaks, badges (inspired by AA chips), and a points system expressed in real dollars that can be spent on a wishlist. An accountability partner can view progress and react via a shared link. The app is a PWA (Progressive Web App) — works in the browser but installable on Android like a native app.

---

## Tech Stack
- **Frontend**: Next.js (React) — same as other user projects
- **Backend/Database**: Supabase (auth, database, storage)
- **Hosting**: Vercel
- **PWA**: next-pwa for Android install + push notifications

---

## Features

### 1. Habits
- Default habits on first login:
  - Did I bite my nails?
  - Did I do running or yoga?
  - Did I avoid spending a lot of money?
  - Did I spend enough time with my family?
  - Did I read?
  - Did I sleep 8 hours or more?
- User can add, edit, and delete habits
- **Dynamic app icon color** (Android home screen) changes based on your longest active streak, like Duolingo:
  - ⚫ Default — no streak yet
  - 🔘 Grey — 5+ day streak
  - 🟤 Bronze — 14+ day streak
  - ⚪ Silver — 30+ day streak
  - 🟡 Gold — 90+ day streak
  - 🩶 Platinum — 180+ day streak
  - 🏆 Cup — 365+ day streak
  - Implemented via a dynamic PWA manifest that serves the correct colored icon based on the user's current streak
- Each habit has:
  - Name (question format)
  - Dollar value per day (e.g. $1.00)
  - Active/inactive toggle
  - **Allowed "No" days per week** (default: 0) — the streak continues even if you answer No, as long as you stay within this limit. Example: "Did I eat healthy?" set to 2 means you can answer No twice a week without breaking your streak.

### 2. Daily Check-In
- One screen per day: list of all habits with Yes / No buttons
- Simple, fast — optimized for Android mobile
- If already checked in today, show today's results (read-only)
- Each habit has three options per day: **Yes**, **No**, or **Freeze**
- One freeze token per week, shared across all habits — using Freeze on a habit protects its streak for that day (max 1 use per week total)

### 3. Points & Dollar Balance
- Each habit kept = base points (= dollar value set for that habit)
- Streak multiplier on top:
  - Days 1–6: 1x
  - Days 7–29: 1.5x
  - Days 30–364: 2x
  - Days 365+: 3x
- Total balance shown in SGD dollars and cents (e.g. S$12.50)
- Balance increases with daily check-ins, decreases when wishlist items are redeemed

### 4. Streaks
- Per-habit streak counter (consecutive days kept)
- Freeze token pauses streak without breaking it (max 1 use per week across all habits)
- Missing a day without a freeze = streak resets to 0

### 5. Badges (AA-style)
Per habit, earned at streak milestones. Same color scale used everywhere (badges, app icon, stats):
- 🔘 Grey — 5-day streak
- 🟤 Bronze — 2-week streak (14 days)
- ⚪ Silver — 1-month streak (30 days)
- 🟡 Gold — 3-month streak (90 days)
- 🩶 Platinum — 6-month streak (180 days)
- 🏆 Championship Cup — 1-year streak (365 days)

Badges displayed on a profile/trophy page per habit.

### 6. Stats Page
- Per habit: current streak, longest streak, total days kept, success rate (%)
- Overall: total dollar balance earned, total check-in days, best streak across all habits
- Simple charts: weekly/monthly habit completion bar chart

### 7. Wishlist (Spending)
- Add items with a name and price (e.g. "New shoes — S$80")
- Pre-loaded first wishlist item: Premium smartphone — S$2,000
- Items show as locked until balance is sufficient
- Mark as "Redeemed" — deducts price from dollar balance
- History of redeemed items

### 8. Accountability Partner
- User generates a shareable link from settings
- Link opens a public read-only page showing:
  - Current streaks per habit
  - Badges earned
  - Recent check-in activity
- Partner can react with one emoji (👍 🔥 💪 ❤️) per day
- Reactions are shown to the user in the app
- No account required for the partner
- Partner receives a push notification when:
  - User earns any badge
  - User breaks a streak of more than 5 days
- Partner uses iPhone — notifications must work on iOS (supported via Web Push on Safari iOS 16.4+)

### 9. Push Notifications (Android PWA)
- Daily reminder at a user-set time (e.g. 9:00 PM)
- Notification text: "Time to check in on your habits!"
- Uses Web Push API via Supabase Edge Functions or a service like OneSignal

---

## Database Tables (Supabase)

- `users` — auth (handled by Supabase Auth)
- `habits` — id, user_id, name, dollar_value, is_active, allowed_no_days_per_week (default 0), created_at
- `checkins` — id, habit_id, user_id, date, kept (boolean)
- `streaks` — id, habit_id, user_id, current_streak, longest_streak
- `freeze_tokens` — id, user_id, week_start, used (boolean)
- `badges` — id, habit_id, user_id, milestone_days, earned_at
- `wishlist_items` — id, user_id, name, price, redeemed (boolean), redeemed_at
- `share_links` — id, user_id, token (unique), created_at
- `reactions` — id, share_link_id, emoji, reacted_at

---

## Build Phases

### Phase 1 — Foundation
- Next.js + Supabase setup, PWA config, Android install support
- Auth (email/password login)
- Habit CRUD (add, edit, delete, list)

### Phase 2 — Daily Check-In
- Check-in screen (Yes/No/Freeze per habit)
- Streak calculation logic
- Freeze token logic

### Phase 3 — Points & Dollar Balance
- Points calculation with streak multiplier
- Dollar balance display in SGD
- Wishlist (add items, redeem, history)

### Phase 4 — Badges & Stats
- Badge logic per habit milestone (Grey → Bronze → Silver → Gold → Platinum → Cup)
- Trophy/badge display page
- Stats page with charts

### Phase 5 — Accountability Partner
- Share link generation
- Public view page
- Emoji reactions
- Push notifications to partner (badge earned, streak broken)

### Phase 6 — Push Notifications
- Daily reminder setup for user
- User sets preferred time

---

## Verification
- Install app on Android via Chrome "Add to Home Screen"
- Complete a daily check-in and confirm streak increments
- Use freeze token and confirm streak preserved
- Earn a 5-day badge and confirm Grey badge appears
- Add wishlist item, redeem it, confirm balance decreases in SGD
- Generate share link, open in incognito, confirm partner view works and reactions appear
- Confirm push notification arrives at set time on Android
- Confirm partner notification works on iPhone (iOS Safari)
