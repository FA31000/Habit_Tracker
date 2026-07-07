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
- New accounts start empty — no default habits. Each user creates their own.
- User can add, edit, and delete habits
- Up/down arrow buttons on each habit to reorder; order persisted in localStorage
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
  - **Description** (optional) — a personal note about why this habit matters. Only visible and editable on the Habits page.

### 2. Daily Check-In
- One screen per day: list of all habits, each with two buttons: **Yes** and **No**
- Simple, fast — optimized for Android mobile
- **Every Yes or No opens a popup** — for every habit, whether or not it has questions configured. There is no separate Freeze button on the card; Freeze lives inside the No popup.
- The **Yes popup** shows any Yes-configured questions, plus a line: "🔥 Your streak will be X days."
- The **No popup** shows any No-configured questions, plus:
  - how many "No"s are left this week (never below 0)
  - a streak-break warning **only when a No would actually break the streak** (i.e. the weekly No allowance is already used up): shows the current streak length and what it will become
  - a **freeze toggle** ("❄️ Use a freeze to protect my streak"). Toggling it on saves the day as a Freeze instead of a No, protecting the streak. The toggle is grayed out and unusable once the week's single freeze has been used. When it is grayed out, a line shows where the freeze went: "❄️ Freeze used on [habit], [date]". Any configured "why not?" question is still asked even when the freeze is used.
- One freeze token per week, shared across all habits. A freeze belongs to the **week of the day it protects** — on a past date, the freeze toggle and "No"s-left count reflect that date's own week, so a forgotten day can be backfilled with a freeze if that week's freeze is unused.
- On the card, the selected No button is colour-coded: **orange** when the No is within the habit's weekly allowance (an allowed No that does not break the streak), **red** when the allowance is used up (this No breaks the streak), and **blue** labelled "❄️ Frozen" when a freeze was used.
- **Badge-coloured cards**: each habit card is tinted with the colour of the badge its **current streak** has reached (a light fill of the badge colour, no border). The colour follows the live current streak, not the permanent earned badge — so breaking a streak drops the card back to plain white until the milestone is reached again. Uses `getStreakBadge` against the current streak; below the first milestone (5 days) the card stays white. When a badge is active, the card header also shows its name in days (e.g. "🟡 90-day badge") between the habit name and the dollar value, so the colour is self-explanatory.
- **Editing / clearing**: tapping a habit that already has an answer reopens the popup pre-filled with the previous answer. The popup has a **Clear** button to remove the answer entirely (which also releases the freeze token if that day was frozen).
- **Unified check-in popup config**: any habit can have a fully configurable set of popup questions, triggered on Yes or No. Config is stored in Supabase in the `habits.question_config` column (jsonb). Answers are stored in Supabase in the `checkins.answers` column (jsonb), one blob per checkin row. Each habit can have any number of questions of two types:
  - **Multi-choice**: a label + list of options (multi-select buttons, 2-column grid)
  - **Number input**: a label + unit (e.g. "Weight / kg", "Minutes read / min")
- Default configs (used when a habit has no saved config, matched by name; defined in `src/lib/popupDefaults.ts`): Exercise (trigger Yes: "What did you do?" multi + "Weight" number), Reading (trigger Yes: "Minutes read" number), Eating (trigger No: "Why not?" multi)
- **One-time migration** (`src/lib/migrate.ts`): on first load after this change, popup data that used to live in localStorage (`habit_popup_config`, `habit_popup_answers`, and legacy `reading_minutes` / `exercise_data`) is copied into the Supabase `habits.question_config` and `checkins.answers` columns, then a `migrated_to_supabase_v1` flag is set so it never runs again.
- **Habit edit — Check-in pop-up section**: toggle on/off, Yes/No trigger, add/delete/edit questions. Each question shows its type badge (Multi-choice in purple, Number in blue), label input, and type-specific fields (options list with add/delete for multi; unit field for number). Add question via "+ Multi-choice" or "+ Number" buttons.
- **Exercise weight graph**: on the Stats page, a line graph showing weight over time appears below the exercise habit card (only shown if at least one weight entry exists).
- **Perfect-day confetti**: when you tap Save Check-In and every habit that day is answered Yes (a perfect day), a confetti burst falls across the screen to celebrate. Self-contained `Confetti` component (`src/components/Confetti.tsx`), no external library.

### 3. Points & Dollar Balance
- Each habit kept = base points (= dollar value set for that habit)
- Streak multiplier on top:
  - Days 1–6: 1x
  - Days 7–29: 1.5x
  - Days 30–364: 2x
  - Days 365+: 3x
- **Perfect day double**: on any day where every active habit is answered Yes (no No, no Freeze, none left blank), that day's total winnings are multiplied by 2. Applied across all days, so past perfect days count too.
- The streak multiplier for a day uses the streak **as of that day**, so each day locks in its own earnings and past days are not re-priced when the streak later grows.
- **One shared money calculation** lives in `src/lib/balance.ts` (`dayEarnings` for a single date, `totalEarned` for all dates), used by both the top badge and the home page so they can never disagree.
- **Top green banner** (`BalanceBadge`): the **all-time total** — sum of every day's earnings minus redeemed wishlist items. Shown on every page, always visible.
- **Home page "Earned today"** (shown after Save Check-In): only the **selected day's** earnings (labelled "Earned this day" when viewing a past date). This is always one of the days that add up to the top all-time total.
- Balance shown in the configured currency symbol (default: S$)
- Top balance increases with daily check-ins, decreases when wishlist items are redeemed

### 4. Streaks
A streak counts every day that is a **"Yes"**, an **allowed "No"**, or a **"Freeze"**, counting backwards from today. Other cases are handled as follows:
- **Yes** — adds 1 to the streak.
- **Freeze** — adds 1 to the streak. The app only lets you record a freeze when one is available (1 per week, shared across all habits), so any saved freeze counts as valid.
- **No** — adds 1 to the streak as long as you are still within that habit's weekly "No" allowance (`allowed_no_days_per_week`). Once you go over the allowance in a given week, the streak **breaks**.
- **Missed day (no answer logged)** — treated exactly like a **"No"**: it uses up the weekly allowance, adds 1 while within it, and breaks the streak once you go over.
- **Today, if not yet answered** — skipped: it does not count and does not break the streak (your number reflects up to yesterday until you answer today).
- **Before your first ever check-in** — nothing is counted (no "missed day" penalty before the habit was first used).
- Weeks run **Monday–Sunday**. When too many No/missed days land in one week, the streak breaks at the day that goes over the limit; only days after that point count toward the current streak.

This is computed live from check-in history (the single source of truth) by `computeHabitStreak` in `src/lib/streak.ts`, used everywhere a streak appears: home page, Stats, Rewards/balance multiplier, Partner view, and badges. Saving a check-in recomputes the per-habit `streaks` table (current + longest) from full history so the Partner view stays accurate.

### 5. Badges (AA-style)
Per habit, earned at streak milestones. The **colored dot/emoji** is the visual, but in **text** each badge is named by its **number of days** (never the colour name, since colours aren't self-explanatory) — e.g. "5-day badge", "30-day badge". On the check-in (home) page the label is shortened to just the days (e.g. "⚫ 5-day") so it fits on one line:
- ⚫ 5-day streak
- 🟤 14-day streak
- ⚪ 30-day streak
- 🟡 90-day streak
- 🩶 180-day streak
- 🏆 365-day streak

Badges are based on the **longest** streak a habit has ever reached and are kept permanently once earned (a later streak reset does not remove them).

Badges displayed on a profile/trophy page per habit.

### 6. Stats Page
- Per habit: current streak, longest streak, total days kept, success rate (%)
- Overall: total dollar balance earned, total check-in days, best streak across all habits
- **Time range switcher** (7 days / 30 days / All time) — controls all popup data visualizations below each habit card
- **Popup data visualizations** per habit (inside the same white card as the habit's streak stats, only if data exists). Hidden by default: a small down-arrow at the bottom of the habit card (shown only when extra stats exist) expands them; clicking again collapses them. The arrow flips upside down when expanded and stays at the bottom of the card.
  - **Number questions** (e.g. Weight, Minutes read): line graph over selected time range + summary stats (avg, total, entries)
  - **Multi-choice questions** (e.g. What did you do?, Why not?): horizontal bar chart showing frequency of each option over selected time range
  - Data read from `checkins.answers` in Supabase (old localStorage data is moved into Supabase by the one-time migration in `src/lib/migrate.ts`)

### 7. Wishlist (Spending)
- Add items with a name, price, and optional product URL (e.g. "New shoes — S$80")
- New accounts start with an empty wishlist
- Items show as locked until balance is sufficient
- Mark as "Redeemed" — deducts price from dollar balance
- Up/down arrow buttons on each reward to reorder; order persisted in localStorage
- History of redeemed items
- **Forecast card** (`src/components/RewardForecast.tsx`), at the top of the Rewards page (the separate "Your balance" card was removed — the top green badge already shows the amount):
  - Run rate = average money earned per day over the last 14 full days (today excluded, days before the first check-in excluded), using the shared `dayEarnings` from `src/lib/balance.ts`
  - Weekly bar chart (recharts): one bar per week — the past 4 weeks plus today show the **actual** balance at that date (dark green), the next 8 weeks show the **projected** balance at the run rate (light green). Each bar has its dollar amount on top; there is no y-axis. A small Past / Projected legend sits under the chart.
  - Under the chart, each reward lists its estimated date: "Ready now", "~15 Aug (39 days)", or "Over a year away" (more than 365 days out)
  - If there is no run rate yet (no full days of history), the card shows a message instead of a chart
- The Rewards page balance now uses the shared `totalEarned` from `src/lib/balance.ts` (active habits only), so it matches the top green badge exactly — previously it used its own older calculation that missed the perfect-day doubling

### 8. Friends
Replaces the old Accountability Partner share-link. Everyone who takes part has their own account.
- **Display name**: set during sign-up ("Your name (shown to friends)"), editable later on the Settings page. Stored in the `profiles` table. A database trigger auto-creates the profile row at sign-up from the name entered. Existing accounts backfilled: `fa.leonard@gmail.com` → "FA", `hadrienchenleonard@gmail.com` → "Hadrien".
- **Friends tab** (6th tab in the bottom nav):
  - **Directory**: a list of every user who has a display name (anonymous/nameless accounts are hidden). Tap a name to open their profile.
  - **Activity feed**: badges and perfect days from every user, merged and sorted newest first.
    - **Badges**: every badge any user has ever earned — e.g. "⚪ Hadrien earned the 30-day badge on 'Did I exercise?'". Shows the date earned. Has thumbs-up and comments (below).
    - **Perfect days**: when a user answers Yes to every active habit on a day, a "🌟 Person had a perfect day — every habit done!" item appears with the date. Recorded in the `perfect_days` table when Save Check-In is tapped on a perfect day, and removed if that day later stops being perfect. No thumbs-up or comments on perfect-day items.
  - **Thumbs-up** on each badge: one per person, tap again to undo. Shows the count and the names of who cheered. You cannot thumbs-up your own badge.
  - **Comments** on each badge: short text (max 280 chars), multiple people, visible to everyone including the earner. You can delete your own comment; no editing. You cannot comment on your own badge.
- **Friend profile page** (`/friends/[id]`): shows the same per-habit cards as your own Stats page — habit name, current streak, best streak, success rate, earned badges, plus the activity charts (number trends and multi-choice bars) with the same 7 days / 30 days / All time switcher. Money balance and wishlist stay private.
- **Privacy/data access**: any signed-in user can read every user's display name, habit names, streaks, badges, perfect days (the `perfect_days` table exposes only user_id + date, never which habits or their values), and daily check-ins. A `public_habits` view exposes safe habit columns (id, user_id, name, is_active, created_at, question_config, allowed_no_days_per_week) — never dollar value or description. A `public_checkins` view exposes check-in columns (id, habit_id, user_id, date, response, answers) so friends see the same stats as the owner.
- In-app only — no push notifications for friend activity.

### 9. Push Notifications (Android PWA)
- Daily reminder at a user-set time (e.g. 9:00 PM)
- Notification text: "Time to check in on your habits!"
- Uses Web Push API via Supabase Edge Functions or a service like OneSignal

### 10. Feedback & Admin
- **User types**: the admin is identified by email (`fa.leonard@gmail.com`, defined in `src/lib/admin.ts`). Everyone else is a normal user. No DB column needed — admin is recognized by email at login.
- **Send Feedback** (all users): a "Send Feedback" box at the bottom of the Settings page. Users type an idea, feature request, or bug and submit. Saved to the `feedback` table with their email.
- **Admin page** (`/admin`, admin only): a dedicated page listing all feedback (newest first), showing the message, sender email, and date. Admin can **Mark as done** (toggle) or **Delete** each item.
- **Admin nav button**: an "Admin" tab appears in the bottom navigation bar **only when the admin is logged in** (hidden for everyone else). The page also re-checks access on load and shows "no access" to non-admins.
- Security: Supabase RLS lets any logged-in user insert their own feedback, but only the admin email can read, update, or delete feedback.
- This page is intended to hold more admin tools in the future, not just feedback.

---

## Database Tables (Supabase)

- `users` — auth (handled by Supabase Auth)
- `habits` — id, user_id, name, description (optional text), dollar_value, is_active, allowed_no_days_per_week (default 0), created_at, question_config (jsonb, optional — the habit's check-in popup questions)
- `checkins` — id, habit_id, user_id, date, response ('yes' | 'no' | 'freeze'), answers (jsonb, optional — the popup answers for that day)
- `streaks` — id, habit_id, user_id, current_streak, longest_streak
- `freeze_tokens` — id, user_id, week_start, used (boolean)
- `badges` — id, habit_id, user_id, milestone_days, earned_at
- `wishlist_items` — id, user_id, name, price, url (optional), redeemed (boolean), redeemed_at
- `profiles` — id (= auth user id), display_name, created_at
- `badge_thumbs` — id, badge_id, user_id, created_at (unique per badge+user)
- `badge_comments` — id, badge_id, user_id, body, created_at
- `public_habits` (view) — id, user_id, name, is_active, created_at, question_config, allowed_no_days_per_week (safe columns only, readable by all signed-in users)
- `public_checkins` (view) — id, habit_id, user_id, date, response, answers (readable by all signed-in users, so friends see the same stats)
- `feedback` — id, user_id, user_email, message, done (boolean), created_at
- *(removed: `share_links`, `reactions` — old Accountability Partner feature)*

---

## Build Phases

### Phase 1 — Foundation
- Next.js + Supabase setup, PWA config, Android install support
- Auth (email/password login) — login page styled to match the app: green emerald/teal gradient background with decorative circles, 🌱 plant logo, and a white card holding the form (matches the in-app header look and feel)
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
- Badge logic per habit milestone (5-day → 14-day → 30-day → 90-day → 180-day → 365-day)
- Trophy/badge display page
- Stats page with charts

### Phase 5 — Friends ✅
- `profiles` table + display name on sign-up and Settings; auto-create trigger; backfill of existing accounts
- Friends tab: directory of all named users + badge feed (all badges, newest first)
- Thumbs-up and comments on badges (`badge_thumbs`, `badge_comments`), with "not your own badge" rule
- Friend profile page showing streaks + badges + habit names
- `public_habits` view + open read access on streaks/badges; old share-link feature removed

### Phase 7 — Settings (Configurable Variables) ✅
- **Access**: the Settings page is reached via a gear icon in the top-right of the app header (not a bottom-nav tab). This keeps the bottom bar less cramped, especially for the admin who also has an Admin tab.
- **Personalised header tagline**: the app header subtitle reads "Build the new [name]", where the name is the logged-in user's `display_name` (falling back to the email prefix). Fetched server-side in the app layout. The login page (no account yet) reads "Build the new you".
- **Streak Bonuses**: editable tier thresholds and multipliers (stored in localStorage, applied immediately to balance calculation)
  - Tier 1: after N days → multiplier (default: 7 days → 1.5×)
  - Tier 2: after N days → multiplier (default: 30 days → 2×)
  - Tier 3: after N days → multiplier (default: 365 days → 3×)
  - Reset to defaults button
- **Currency Symbol**: editable text field (default: S$), shown next to balance everywhere
- Config stored in `localStorage` under key `app_config`
- Changes take effect immediately on the check-in page via a `storage` event listener

### Phase 6 — Push Notifications ✅
- Service worker (`/public/sw.js`) handles incoming push events
- VAPID keys generated and stored in `.env.local`
- `/api/push/subscribe` — saves user's push subscription to Supabase
- `/api/push/send` — sends a push to any user by user_id + role
- `/api/cron/daily-reminder` — Vercel cron (every minute) checks who needs a reminder now and sends it
- `vercel.json` configured with cron schedule
- Settings page: "Enable Notifications" button + time picker (default 9 PM)
- `push_subscriptions` table in Supabase (user_id, role, subscription)
- `user_settings` table in Supabase (user_id, reminder_time)

---

## Verification
- Install app on Android via Chrome "Add to Home Screen"
- Complete a daily check-in and confirm streak increments
- Use freeze token and confirm streak preserved
- Earn a 5-day streak and confirm the 5-day badge appears
- Add wishlist item, redeem it, confirm balance decreases in SGD
- Open the Friends tab, confirm the badge feed lists friends' badges, give a thumbs-up and leave a comment
- Tap a friend's name and confirm their streaks and badges show (but not money/wishlist)
- Confirm push notification arrives at set time on Android
