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
  - **Start date** (defaults to today, editable when creating or editing) — the first day the habit applies. On days before it, the habit is hidden on the check-in page and ignored for earnings and the perfect-day double (`habitStarted()` in `src/lib/types.ts`). Stored in `habits.start_date` (migration: `supabase-start-date.sql`); existing habits were given their creation day, or their first check-in if earlier.

### 2. Daily Check-In
- One screen per day: list of all habits, each with two buttons: **Yes** and **No**, plus a small grey third button **NA** (not applicable)
- **NA (not applicable)**: for days a habit can't be done (e.g. on holiday, no access to the bar). One tap saves it straight away — no popup, no questions. When selected the button turns grey and the card's dollar value shows grey. Tap Yes or No to change it. NA can be set on any past day, including turning a No into NA. There is no limit on how often NA is used; it is visible to friends like any other answer. NA pays nothing, pauses the streak (see Streaks), does not use the weekly No allowance, does not use the freeze, and does not cost the weekly no-freeze bonus. Stored as `response = 'na'` (migration: `supabase-na.sql`).
- Simple, fast — optimized for Android mobile
- **Every Yes or No opens a popup** (NA does not) — for every habit, whether or not it has questions configured. There is no separate Freeze button on the card; Freeze lives inside the No popup.
- The **Yes popup** shows any Yes-configured questions, plus a line: "🔥 Your streak will be X days."
- The **No popup** shows any No-configured questions, plus:
  - how many "No"s are left this week (never below 0)
  - a streak-break warning **only when a No would actually break the streak** (i.e. the weekly No allowance is already used up): shows the current streak length and what it will become
  - a **freeze toggle** ("❄️ Use a freeze to protect my streak"). Toggling it on saves the day as a Freeze instead of a No, protecting the streak. The toggle is grayed out and unusable once the week's single freeze has been used. When it is grayed out, a line shows where the freeze went: "❄️ Freeze used on [habit], [date]". Any configured "why not?" question is still asked even when the freeze is used.
- One freeze token per week, shared across all habits. A freeze belongs to the **week of the day it protects** — on a past date, the freeze toggle and "No"s-left count reflect that date's own week, so a forgotten day can be backfilled with a freeze if that week's freeze is unused.
- On the card, before a habit is answered, the **No button shows a small grey number badge** with how many "No"s are left this week (the habit's weekly allowance minus No's already used that week, never below 0). The badge disappears once the habit is answered.
- On the card, the selected No button is colour-coded: **orange** when the No is within the habit's weekly allowance (an allowed No that does not break the streak), **red** when the allowance is used up (this No breaks the streak), and **blue** labelled "❄️ Frozen" when a freeze was used.
- **Badge-coloured cards**: each habit card is tinted with the colour of the badge its **current streak** has reached (a light fill of the badge colour, no border). The colour follows the live current streak, not the permanent earned badge — so breaking a streak drops the card back to plain white until the milestone is reached again. Uses `getStreakBadge` against the current streak; below the first milestone (7 days) the card stays white. When a badge is active, the card header also shows its name in days (e.g. "🟡 90-day badge") between the habit name and the dollar value, so the colour is self-explanatory.
- **Editing / clearing**: tapping a habit that already has an answer reopens the popup pre-filled with the previous answer. The popup has a **Clear** button to remove the answer entirely (which also releases the freeze token if that day was frozen).
- **Unified check-in popup config**: any habit can have a fully configurable set of popup questions, triggered on Yes or No. Config is stored in Supabase in the `habits.question_config` column (jsonb). Answers are stored in Supabase in the `checkins.answers` column (jsonb), one blob per checkin row. Each habit can have any number of questions of two types:
  - **Multi-choice**: a label + list of options (multi-select buttons, 2-column grid)
  - **Number input**: a label + unit (e.g. "Weight / kg", "Minutes read / min")
- Questions are per-habit, per-user only: they come solely from that habit's saved `question_config`. There are **no** name-based default questions — a habit with no saved config has no popup questions, and deleting a question stays deleted.
- **One-time migration** (`src/lib/migrate.ts`): on first load after this change, popup data that used to live in localStorage (`habit_popup_config`, `habit_popup_answers`, and legacy `reading_minutes` / `exercise_data`) is copied into the Supabase `habits.question_config` and `checkins.answers` columns, then a `migrated_to_supabase_v1` flag is set so it never runs again.
- **Habit edit — Check-in pop-up section**: toggle on/off, Yes/No trigger, add/delete/edit questions. Each question shows its type badge (Multi-choice in purple, Number in blue), label input, and type-specific fields (options list with add/delete for multi; unit field for number). Add question via "+ Multi-choice" or "+ Number" buttons.
- **Exercise weight graph**: on the Stats page, a line graph showing weight over time appears below the exercise habit card (only shown if at least one weight entry exists).
- **Check-in rewards** (visual payoff for doing the habits; applies to every user, no settings, no database changes):
  - **On each Yes / No / Freeze** (answer changed in the popup; NA has no popup and gets nothing): as the popup closes, a few lines float up from the card, stay readable for about 3 seconds, then fade (4s in total). Built by `floatLines` on the home page.
    - **Yes**: a short buzz (Android only; iOS has no vibration API), a green "+S$X" (the habit's value × the multiplier for the streak including this Yes, matching the card), "🔥 N-day streak" (including this Yes).
    - **No**: no buzz, no money. "💔 N-day streak broken" (red) when the No ends a streak, N being the streak it had; "🟠 Allowed No · streak N days" plus "K Nos left this week" when it's within the weekly allowance; "❌ No streak running" when over the allowance with no streak to lose.
    - **Freeze**: "❄️ N-day streak protected" (blue).
    - **All three**: the habit's success rate after the answer and how many percentage points it moved versus the day's previous answer (or no answer): "📈 60% (+0.3 pts)" / "📉 59% (−0.5 pts)". Same Yes ÷ (Yes + No) as the Stats page, rounded (`successRate` in `src/lib/streak.ts`). When it doesn't move (e.g. a freeze, which counts as neither), just "📊 60%".
  - **On Save Check-In for today**: a full-screen overlay (`src/components/CelebrationOverlay.tsx`), dismissed by tapping anywhere (taps ignored for the first 0.6s so it isn't closed by accident). In order: the day's earnings count up from 0; on a perfect day a "×2" stamp lands and the number counts on to the doubled amount; the overall balance rolls from its old value (new balance − today's earnings) to the new one; a ring shows the longest current streak's progress towards its next badge, with every habit's streak in chips underneath; then one line of encouraging content fades in. The "Check-in complete" card stays on the page afterwards and now also shows "Balance now".
  - **Three tiers**, set in `buildCelebration` (`src/lib/celebration.ts`):
    - **Partial day** (not every applicable habit Yes): dark slate background, "Day logged · 3 of 4 habits done", no confetti, one short buzz.
    - **Perfect day**: green background, "Perfect day!", confetti, the ×2 step, a longer buzz.
    - **Milestone day**: a new badge was earned or a reward became affordable (its price lies between the balance before and after today). Amber-to-green background, chips naming each new badge / unlocked reward, the most confetti in the badge's colour, the strongest buzz. The ring shows the habit that earned the badge, full, labelled "14-day badge".
  - **Escalation**: a badge or reward **3 days away or fewer** (`NEAR_DAYS`) counts as "close". On a perfect day that adds an "Almost there" chip, more confetti and a stronger buzz; on a partial day only the chip.
  - **Content line — one per day, rotating** through: reward progress ("S$14 to go for AirPods — about 6 days at this pace", using the same 14-day run rate as the Rewards forecast), next badge countdown ("2 days to your 14-day badge (1.75×)", for the habit closest to its next badge), the habit's own description shown back as its "why" (habits answered Yes that have one), and a quote. The rotation is by date, so a day always shows the same line; a type with nothing to show is skipped. **Big moments override the rotation**: on a new-badge day the badge habit's "why" (if it has a description), else a badge 3 days away or fewer, else a reward 3 days away or fewer.
  - **Quotes**: ~55 short quotes with authors, kept in code (`src/lib/quotes.ts`). Edit the list there.
  - **Backfilled days** (Save Check-In on a past date): no overlay, no confetti, no buzz — just the summary card with that day's earnings and the balance now.
  - The balance comes from `fetchMoneySnapshot` (`src/lib/moneySnapshot.ts`), shared with the top green badge so the two can't disagree; Save Check-In also fires the `balance` storage event so the header updates at once. The run rate is `ratePerDay` in `src/lib/balance.ts`, shared with the Rewards page.
  - Confetti is still the self-contained `Confetti` component (`src/components/Confetti.tsx`), now taking a piece count and colours.

### 3. Points & Dollar Balance
- Each habit kept = base points (= dollar value set for that habit)
- Streak multiplier on top: **one multiplier per badge milestone**, set by the admin on the Admin page (below the first milestone the multiplier is 1×). Defaults:
  - ⚫ 7+ days: 1.5x
  - 🟤 14+ days: 1.75x
  - ⚪ 30+ days: 2x
  - 🟡 90+ days: 2.5x
  - 🩶 180+ days: 3x
  - 🏆 365+ days: 4x
- **Perfect day double**: on any day where every active habit that has started by that day and applied is answered Yes (no No, no Freeze, none left blank), that day's total winnings are multiplied by 2. Habits marked NA are left out of the check, but at least one habit must be Yes. Same rule for the confetti and the friends-feed perfect day (`isPerfectDay` in `src/lib/balance.ts`). Applied across all days, so past perfect days count too.
- The streak multiplier for a day uses the streak **as of that day**, so each day locks in its own earnings and past days are not re-priced when the streak later grows.
- **Weekly no-freeze bonus**: for every week (Mon–Sun) that has finished — its Sunday is today or earlier — since the user's first check-in, if **no freeze was used** that week, the user earns a flat bonus (default **S$10**, set by the admin, applies to everyone). A week is judged only by whether a freeze was used, so even a week with no activity counts. The current in-progress week (its Sunday still in the future) is excluded so the bonus isn't awarded then clawed back. Computed by `freezeBonusTotal` in `src/lib/balance.ts` and folded into `totalEarned`, so it flows into the top green balance and the Rewards balance automatically. When you tap **Save Check-In on a Sunday** and didn't use a freeze that week, the check-in-complete screen shows a card: "❄️ No freeze used this week — you earned a S$10 bonus!".
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
- **NA** — skipped: it does not add 1 and does not break the streak (the streak is paused). It does not use the weekly No allowance.
- **Auto-No**: when the app is opened (the check-in page loads, once per app open — not on every date change), every blank day before today is saved as a real **No**, for each active habit, starting from that habit's first ever check-in (or its start date, if later). Existing answers are never overwritten. Inactive habits and habits with no check-in yet are not filled. An auto-No looks and counts exactly like a No you pressed; change it to Yes, NA or Freeze by hand if needed. Streaks and money are unchanged by this, since a blank day was already treated as a No. Code: `fillMissedDays` in `src/lib/autoNo.ts`, called from the home page `load`.
- **Missed day (no answer logged)** — treated exactly like a **"No"**: it uses up the weekly allowance, adds 1 while within it, and breaks the streak once you go over.
- **Today, if not yet answered** — skipped: it does not count and does not break the streak (your number reflects up to yesterday until you answer today).
- **Before your first ever check-in** — nothing is counted (no "missed day" penalty before the habit was first used).
- Weeks run **Monday–Sunday**. When too many No/missed days land in one week, the streak breaks at the day that goes over the limit; only days after that point count toward the current streak.

This is computed live from check-in history (the single source of truth) by `computeHabitStreak` in `src/lib/streak.ts`, used everywhere a streak appears: home page, Stats, Rewards/balance multiplier, Partner view, and badges. Saving a check-in recomputes the per-habit `streaks` table (current + longest) from full history so the Partner view stays accurate. Save Check-In fetches all habits' data at the same time and sends all writes at the same time (not one habit after another), so it takes well under a second.

### 5. Badges (AA-style)
Per habit, earned at streak milestones. The **colored dot/emoji** is the visual, but in **text** each badge is named by its **number of days** (never the colour name, since colours aren't self-explanatory) — e.g. "7-day badge", "30-day badge". On the check-in (home) page the badge is shown only by the card's **background colour**; the text next to the dollar value instead shows the habit's **current streak** (e.g. "12 days"), displayed on every habit even without a badge. The streak, card colour and dollar value **update live as you tap** an answer (before Save Check-In), using the streak that answer leads to. The dollar value on each card is **what a Yes on that day pays**: base value × the multiplier for the streak *including* that Yes. So on day 13 of a streak, the card already shows the 14-day badge's rate, since the Yes is what reaches it. (Previously it used the streak before the Yes, so it disagreed with the actual payout whenever a Yes crossed a badge.) The value is **coloured by that day's answer**: green when answered Yes (earned), red when answered No or Frozen (not earned), gray while unanswered or NA:
- ⚫ 7-day streak
- 🟤 14-day streak
- ⚪ 30-day streak
- 🟡 90-day streak
- 🩶 180-day streak
- 🏆 365-day streak

Badges are based on the **longest** streak a habit has ever reached and are kept permanently once earned (a later streak reset does not remove them).

Badges displayed on a profile/trophy page per habit.

### 6. Stats Page
- Per habit: a small top row of all-time answer counts — ✅ Yes · ❌ No · ❄️ Freeze · ⏸️ NA — then current streak, longest streak and success rate (%) below. **Rate = Yes ÷ (Yes + No)**; Freeze and NA are left out. Missed days count as No because auto-No saves them. Counts, rate and charts are all-time. Computed by `responseCounts` in `src/lib/streak.ts`; the friend profile page shows the same row and rate.
- **Badge legend**: a small "Badges" card at the top of the page showing all six badge colors with their day counts (⚫ 7, 🟤 14, ⚪ 30, 🟡 90, 🩶 180, 🏆 365), as a reminder of what each badge means (the overall Balance / Days done / Best streak cards were removed — the top green badge already shows the balance)
- **Popup data visualizations** per habit (inside the same white card as the habit's streak stats, only if data exists). Hidden by default: a small down-arrow at the bottom of the habit card (shown only when extra stats exist) expands them; clicking again collapses them. The arrow flips upside down when expanded and stays at the bottom of the card.
  - **Number questions** (e.g. Weight, Minutes read): line graph over all time + summary stats (avg, total, entries)
  - **Multi-choice questions** (e.g. What did you do?, Why not?): horizontal bar chart showing frequency of each option over all time
  - Data read from `checkins.answers` in Supabase (old localStorage data is moved into Supabase by the one-time migration in `src/lib/migrate.ts`)

### 7. Wishlist (Spending)
- Add items with a name, price, and optional product URL (e.g. "New shoes — S$80")
- **One "+ Add" button for both**: the single green pill in the page header opens an "Add" modal that starts on **Reward**, with a **Reward | Credit** segmented toggle at the top (`AddTypeToggle`). Switching swaps to the other form, so one button creates either kind and there is no separate add button anywhere else on the page. The toggle is hidden when editing — an existing reward can't be turned into a credit — and the modal is then titled "Edit Reward" / "Edit Credit".
- **Rewards and credits are created, edited and deleted the same way** (deliberately kept identical so the two feel like one thing): a single modal per type handles both add and edit, driven by one form-state object, with the same field styling and the same **Cancel / Save** buttons. Deleting is the same on both: a ✕ on the row, a `Remove this reward?` / `Remove this credit?` confirm, then a reload and a header-badge refresh.
- New accounts start with an empty wishlist
- **Any reward can be redeemed at any time, even without the money for it.** The balance is allowed to go negative and later earnings pay it back. The Redeem button is never disabled: when the reward costs more than the balance it turns amber and reads `🎁 Redeem (−S$X)` (X = the shortfall), and the confirm dialog adds a line saying what the balance will be after. The progress bar still shows how much is saved (clamped 0–100%).
- Mark as "Redeemed" — deducts price from dollar balance
- **Up/down arrow buttons on each reward to reorder**, saved to the account in `wishlist_items.sort_order` (migration: `supabase-reward-order.sql`), so the order is the same on every device. Rewards are loaded ordered by `sort_order` (nulls last), then price — a brand new reward has no position yet, so it lands at the bottom. Moving one renumbers every visible reward 0…n.
  - The arrows move rewards within the **visible** (not yet redeemed) list. Previously the click handler applied the move to the full item list, which also holds redeemed rewards: once a redeemed reward sat between two available ones, the arrows silently swapped rows that weren't on screen and appeared dead. Fixed.
  - The old browser-only order (`rewards_order` in localStorage) is lifted onto the account once, on first load, and only when no reward has a `sort_order` yet — so an order already set on another device wins.
- History of redeemed items
- **A redemption can be cancelled.** Every row in the "Redeemed" list has an **Undo** button next to its price. It asks `Cancel "<name>"? S$X goes back to your balance.`, then clears `redeemed` and `redeemed_at` on the row. The reward reappears in the available list (at the bottom, since it keeps its old `sort_order` or none) and its price is added back to the balance — Spent drops by the price and the top green badge refreshes. Nothing is deleted, so the same reward can be redeemed again later.
- **Forecast card** (`src/components/RewardForecast.tsx`), at the top of the Rewards page (the separate "Your balance" card was removed — the top green badge already shows the amount):
  - Run rate = average money earned per day over the last 14 full days (today excluded, days before the first check-in excluded), using the shared `dayEarnings` from `src/lib/balance.ts`
  - Weekly bar chart (recharts): one bar per week — the past 4 weeks plus today show the **actual** balance at that date (dark green), the next 8 weeks show the **projected** balance at the run rate (light green). Each bar has its dollar amount on top; there is no y-axis. The scale reaches below zero when the balance is negative, so a deficit draws as a bar under the baseline. A small Past / Projected legend sits under the chart.
  - Under the chart, each reward lists its estimated date: "Ready now", "~15 Aug (39 days)", or "Over a year away" (more than 365 days out)
  - If there is no run rate yet (no full days of history), the card shows a message instead of a chart
- The Rewards page balance now uses the shared `totalEarned` from `src/lib/balance.ts` (active habits only), so it matches the top green badge exactly — previously it used its own older calculation that missed the perfect-day doubling

#### Credits (money that arrived)
Real money that turns up outside the habit engine — selling something second-hand, a gift, cashback, a refund — logged by hand to top up the reward budget. It is **not** a reward for behaviour: it never pays out like a habit and never affects the run rate.
- **Each credit** has a description, an amount (one net number — what actually landed, after any fees) and a date (defaults to today, backdatable). Amounts are positive only — there is no debit/expense side. There is **no type field**: every credit is a sale, so the original Sold / Gift / Cashback / Other tag only ever had one answer and was removed.
- **Four-figure strip** at the top of the Rewards page, read like a mini income statement: **Earned** (all-time habit earnings) · **Credit** (all-time top-ups) · **Spent** (all-time redeemed, shown as a grey −S$X) · **Balance** (the result, bold green). Every figure is **gross**, so the arithmetic is visible on screen: `Earned + Credit − Spent = Balance`. Because the gross figures are shown, there is no rule about which pot drains first — `availableBalance()` in `src/lib/balance.ts` is just `earned + credits − spent`, with **no clamp at zero**. A negative Balance is shown in red as `−S$X` (both here and in the top badge, where the pill turns red).
- **Top green badge** shows **Balance** (earnings + credits − redeemed) on every page, so it never under-reports what can actually be spent. The four-figure breakdown appears only on the Rewards page.
- **Forecast — step, then slope**: credits count towards the current balance and towards the four past history bars (using their own date, via `creditsTotal(credits, upToDate)`), so a S$830 credit reads as a visible step up in the dark green "Past" bars. Credits **never** enter `ratePerDay` — that stays "money my habits generate per day" — so the projected bars keep the normal habit slope instead of lurching when a one-off sale ages out of the 14-day window.
- **Ledger UI**: section at the bottom of the Rewards page (below "Redeemed"), headed `Credits · S$X`, **expanded by default** — every entry (newest first, with its type, date, amount, and edit/delete buttons) is visible on arrival. The heading is a toggle, so it can be collapsed by hand. There is no add button here: credits are created from the page's single "+ Add" button at the top. The header "+ Add" button still means "add reward" only.
- **Free edit and delete**, deliberately unguarded: there is no overdraft protection. Deleting a credit that has already been spent now pushes the balance negative and it is shown as a deficit — the fix is to re-add the credit or remove the redemption.
- Available to **all users**, not admin-gated.
- **Live header refresh**: the top green `BalanceBadge` sits in the layout and never remounts during client-side navigation, so redeeming a reward or adding/editing/deleting a credit fires a `storage` event with key `balance` (same idiom as `app_config`). The badge listens for it and refetches, so the header and the Rewards page can't drift apart without a full page reload.

### 8. Friends
Replaces the old Accountability Partner share-link. Everyone who takes part has their own account.
- **Display name**: set during sign-up ("Your name (shown to friends)"), editable later on the Settings page. Stored in the `profiles` table. A database trigger auto-creates the profile row at sign-up from the name entered. Existing accounts backfilled: `fa.leonard@gmail.com` → "FA", `hadrienchenleonard@gmail.com` → "Hadrien".
- **Friends tab** (6th tab in the bottom nav):
  - **Directory**: a list of every user who has a display name (anonymous/nameless accounts are hidden). Tap a name to open their profile.
  - **Activity feed**: badges and perfect days from every user, merged and sorted newest first.
    - **Badges**: every badge any user has ever earned — e.g. "⚪ Hadrien earned the 30-day badge on 'Did I exercise?'". Shows the date earned. Has thumbs-up and comments (below).
    - **Perfect days**: when a user answers Yes to every active habit that applied on a day (NA habits left out), a "🌟 Person had a perfect day — every habit done!" item appears with the date. Recorded in the `perfect_days` table when Save Check-In is tapped on a perfect day, and removed if that day later stops being perfect.
  - **Thumbs-up** on each badge and perfect-day item: one per person, tap again to undo. Shows the count and the names of who cheered. You cannot thumbs-up your own item.
  - **Comments** on each badge and perfect-day item: short text (max 280 chars), multiple people, visible to everyone including the earner. You can delete your own comment; no editing. You cannot comment on your own item.
- **Friend profile page** (`/friends/[id]`): shows the same per-habit cards as your own Stats page — habit name, Yes / No / Freeze / NA counts, current streak, best streak, success rate, earned badges, plus the activity charts (number trends and multi-choice bars), all-time (no time range switcher). Money balance and wishlist stay private.
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
- **Streak Bonuses card** (top of the Admin page): one points-multiplier input per badge milestone (7, 14, 30, 90, 180, 365 days) plus a "Reset to defaults" button. Every change saves immediately ("Saving... / Saved ✓" indicator). Applies to **all users** — moved here from the per-device Settings page.
- **Weekly No-Freeze Bonus card** (Admin page, below Streak Bonuses): a single dollar input for the flat bonus paid each finished freeze-free week (default S$10). Saves immediately with the same indicator; applies to **all users** (stored as `weeklyNoFreezeBonus` in the shared `app_config`). See "Weekly no-freeze bonus" under Points & Dollar Balance for the rules.
- **Shared app config**: stored in the Supabase `app_config` table (single row, `config` jsonb holding `badgeMultipliers`, `currencySymbol`, and `weeklyNoFreezeBonus`; created by `supabase-appconfig.sql`). RLS: any signed-in user can read, only the admin email can insert/update. Pages fetch it via `fetchAppConfig()` in `src/lib/appConfig.ts`, which also caches the result in localStorage (`app_config`) as an offline fallback and fires a `storage` event so open pages refresh instantly.
- **Per-account streak bonus override**: an optional per-user override of the badge multipliers, stored in the Supabase `user_bonus_config` table (`user_id`, `badge_multipliers` jsonb; created by `supabase-user-bonus.sql`). RLS: each user can read only their own row; rows are set by the admin via SQL. The money calculation uses `fetchUserConfig()` in `src/lib/appConfig.ts`, which starts from the shared config and layers the current user's override on top if a row exists — accounts with no row keep the shared/default bonus unchanged. Used by the home page, Rewards page, and the top `BalanceBadge` (the Admin page still uses `fetchAppConfig()` to edit the shared config). The perfect-day double is unaffected. Currently only one account uses this: Hadrien (`hadrienchenleonard@gmail.com`), given a gentle ladder capped at 1.45x (`7→1.15, 14→1.25, 30→1.35, 90→1.45, 180→1.45, 365→1.45`) so a flawless week tops out near S$20.
- This page is intended to hold more admin tools in the future, not just feedback.

---

## Database Tables (Supabase)

- `users` — auth (handled by Supabase Auth)
- `habits` — id, user_id, name, description (optional text), dollar_value, is_active, allowed_no_days_per_week (default 0), created_at, start_date (date, first day the habit applies), question_config (jsonb, optional — the habit's check-in popup questions)
- `checkins` — id, habit_id, user_id, date, response ('yes' | 'no' | 'freeze' | 'na'), answers (jsonb, optional — the popup answers for that day)
- `streaks` — id, habit_id, user_id, current_streak, longest_streak
- `freeze_tokens` — id, user_id, week_start, used (boolean)
- `badges` — id, habit_id, user_id, milestone_days, earned_at
- `wishlist_items` — id, user_id, name, price, url (optional), redeemed (boolean), redeemed_at
- `profiles` — id (= auth user id), display_name, created_at
- `badge_thumbs` — id, badge_id, user_id, created_at (unique per badge+user)
- `badge_comments` — id, badge_id, user_id, body, created_at
- `perfect_day_thumbs` — id, owner_id, date, user_id, created_at (unique per perfect day+user; created by `supabase-perfect-day-reactions.sql`)
- `perfect_day_comments` — id, owner_id, date, user_id, body, created_at (created by `supabase-perfect-day-reactions.sql`)
- `public_habits` (view) — id, user_id, name, is_active, created_at, question_config, allowed_no_days_per_week (safe columns only, readable by all signed-in users)
- `public_checkins` (view) — id, habit_id, user_id, date, response, answers (readable by all signed-in users, so friends see the same stats)
- `feedback` — id, user_id, user_email, message, done (boolean), created_at
- `credits` — id, user_id, description, amount (numeric, > 0), date, created_at (created by `supabase-credits.sql`; RLS: each user reads and writes only their own rows)
- `user_bonus_config` — user_id (= auth user id), badge_multipliers (jsonb), created_at (optional per-account override of the streak-bonus ladder; created by `supabase-user-bonus.sql`)
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
- Badge logic per habit milestone (7-day → 14-day → 30-day → 90-day → 180-day → 365-day)
- Trophy/badge display page
- Stats page with charts

### Phase 5 — Friends ✅
- `profiles` table + display name on sign-up and Settings; auto-create trigger; backfill of existing accounts
- Friends tab: directory of all named users + badge feed (all badges, newest first)
- Thumbs-up and comments on badges (`badge_thumbs`, `badge_comments`) and perfect days (`perfect_day_thumbs`, `perfect_day_comments`), with "not your own item" rule
- Friend profile page showing streaks + badges + habit names
- `public_habits` view + open read access on streaks/badges; old share-link feature removed

### Phase 7 — Settings (Configurable Variables) ✅
- **Access**: the Settings page is reached via a gear icon in the top-right of the app header (not a bottom-nav tab). This keeps the bottom bar less cramped, especially for the admin who also has an Admin tab.
- **Personalised header tagline**: the app header subtitle reads "Build the new [name]", where the name is the logged-in user's `display_name` (falling back to the email prefix). Fetched server-side in the app layout. The login page (no account yet) reads "Build the new you".
- **Streak Bonuses**: moved to the Admin page (see section 10) — one multiplier per badge milestone, admin-only, stored in the Supabase `app_config` table so it applies to everyone
- **Currency Symbol**: part of the shared `app_config` (default: S$), shown next to balance everywhere; no UI yet
- Config changes take effect immediately on the check-in page via a `storage` event listener

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
- Earn a 7-day streak and confirm the 7-day badge appears
- Add wishlist item, redeem it, confirm balance decreases in SGD
- Open the Friends tab, confirm the badge feed lists friends' badges, give a thumbs-up and leave a comment
- Tap a friend's name and confirm their streaks and badges show (but not money/wishlist)
- Confirm push notification arrives at set time on Android

---

## History Log

- **2026-10-12 (latest)** — Stats page and friend profile page: added a row of Yes / No / Freeze / NA counts above Streak · Best · Rate. Rate changed from Yes ÷ all logged days to **Yes ÷ (Yes + No)** (Freeze and NA left out). New `responseCounts` in `src/lib/streak.ts`.
- **2026-10-12** — Added **auto-No**: on app open, every blank past day (from each active habit's first check-in up to yesterday) is saved as a "no". First run backfilled the old gaps. Streaks and balance verified unchanged (S$779.28 before and after). New `src/lib/autoNo.ts`, called once per app open from `src/app/(app)/page.tsx`.
- **2026-10-12** — Added **NA (not applicable)** as a third answer: small grey button on each habit card, one tap, no popup. NA pauses the streak (no +1, no break), pays nothing, uses neither the No allowance nor the freeze, and is left out of the perfect-day check (at least one Yes still needed). New `isPerfectDay` in `src/lib/balance.ts`, NA skip in `src/lib/streak.ts`, `'na'` added to the response type, new migration `supabase-na.sql`.
- **2026-10-12 (later)** — Faster **Save Check-In**. It used to make 4–5 database trips per habit, one after another (~40+ trips, 5–15 seconds). Now all reads happen at once, then all writes happen at once (~0.4 seconds). Same streak, badge and perfect-day results. Changed `saveAll` in `src/app/(app)/page.tsx`.
- **2026-10-12 (later)** — Found 6 `streaks` rows whose `user_id` was an old login instead of the habit's owner, so saving could not update them (they silently stayed stale). New `supabase-fix-streak-owner.sql` sets every streak's `user_id` to its habit's owner (run in Supabase on 2026-10-12; all 8 now match).
- **2026-10-12** — Added a **start date** to habits. New/Edit Habit form has a "Start date" field (defaults to today). Before that date the habit is hidden on the check-in page and doesn't count for earnings or perfect days — this also stops a newly added habit from cancelling the perfect-day double on all past days. New column `habits.start_date` via `supabase-start-date.sql` (existing habits backfilled to their creation day, or first check-in if earlier). Changed: `src/lib/types.ts`, `src/lib/balance.ts`, `src/components/HabitForm.tsx`, `src/app/(app)/page.tsx`, `src/components/BalanceBadge.tsx`, `src/app/(app)/rewards/page.tsx`.
- **2026-08-13** — Removed the credit **type tag**. Every credit is money from selling something, so the Sold / Gift / Cashback / Other picker only ever had one answer. Dropped the four-button row from the credit form, the type label from each ledger row (which now shows just the date), the `kind` column from the `credits` table (`alter table credits drop column if exists kind;`, added to `supabase-credits.sql`), and `CreditKind` / `CREDIT_KINDS` from `src/lib/types.ts`. Changed: `src/lib/types.ts`, `src/app/(app)/rewards/page.tsx`, `supabase-credits.sql`.
- **2026-08-13 (latest)** — Merged the two add buttons into one. The green "+ Add" pill in the Rewards page header now opens a single "Add" modal carrying a **Reward | Credit** toggle at the top (new `AddTypeToggle`); switching swaps to the other form. The separate "+ Add" button on the credits section was removed, so the page has exactly one way to create anything. The toggle only appears when adding — editing keeps its "Edit Reward" / "Edit Credit" title and no type switch. Changed: `src/app/(app)/rewards/page.tsx`.
- **2026-08-13 (later)** — Aligned the reward and credit flows so they read as one feature. Rewards previously had **two** near-identical modals (Add / Edit) driven by eight state variables; they now use a **single** modal and one form-state object, exactly like credits — same fields, same styling, same Cancel / Save buttons (the add modal's button said "Add", now both say "Save"). Deletion matched up too: the confirm text went from "Remove this item?" to "Remove this reward?" to pair with "Remove this credit?", and deleting a reward now reloads from the database and refreshes the header badge instead of only patching local state. Also made the credits ledger **expanded by default** rather than collapsed. Net: ~45 fewer lines in `src/app/(app)/rewards/page.tsx`, no behaviour lost.
- **2026-08-13** — Added **Credits** to the Rewards page: real money that arrived (a sale, a gift, cashback) logged by hand to top up the reward budget, kept separate from habit earnings. New `credits` table (`supabase-credits.sql`, RLS per user, all accounts). New `creditsTotal()` and `availableBalance()` in `src/lib/balance.ts`. The Rewards page gained an **Earned · Credit · Spent · Balance** strip at the top — all four gross, so `Earned + Credit − Spent = Balance` is visible on screen — and a collapsed credits ledger at the bottom with add/edit/delete; the top `BalanceBadge` now shows Balance. (First cut showed only Earned · Credit · Available with credit netted off spending, which made the Credit figure disagree with the amount actually entered; replaced with the gross four-figure version, which also removed the need for any credit-drains-first rule.) Credits count in the forecast's past bars by their own date but never in `ratePerDay`, so the chart steps up then keeps the habit slope. Deliberately unguarded: no overdraft protection, the existing zero clamp stays. Also fixed a pre-existing staleness bug this exposed: the header badge only ever fetched on mount, so redeeming a reward (and now adding a credit) left it showing an old amount until a full page reload — it now refetches on a `balance` storage event fired by the Rewards page. New file: `supabase-credits.sql`; changed: `src/lib/types.ts`, `src/lib/balance.ts`, `src/components/BalanceBadge.tsx`, `src/app/(app)/rewards/page.tsx`.
- **2026-07-30** — Added a **weekly no-freeze bonus**: for every finished week (Mon–Sun, its Sunday today or earlier) since the first check-in where no freeze was used, the user earns a flat bonus (default S$10). Judged purely on freeze use, so an inactive week still counts; the in-progress week is excluded. Computed by new `freezeBonusTotal()` in `src/lib/balance.ts` and folded into `totalEarned` (which now takes an optional `today`), so it flows into the top balance and Rewards balance for **every** account. New `weeklyNoFreezeBonus` field in `AppConfig` (default 10; stored in the shared `app_config` jsonb, carried through the per-account override in `fetchUserConfig`). Admin editing box added under Streak Bonuses. On the home page, saving a check-in on a **Sunday** with no freeze used that week shows a "❄️ No freeze used this week — you earned a S$10 bonus!" card. Changed: `src/lib/types.ts`, `src/lib/appConfig.ts`, `src/lib/balance.ts`, `src/app/(app)/admin/page.tsx`, `src/app/(app)/page.tsx`.
- **2026-07-30** — Speed-up of the home page and the header balance badge. Three changes, no behaviour change: (1) the home page's database reads (habits, today's check-ins, freeze token, all check-ins, user config) now run **in parallel** instead of one after another — was ~7 sequential round-trips, now ~2; (2) the same parallel treatment for `BalanceBadge` (config, habits, check-ins, redeemed wishlist items); (3) removed a dead `weeklyNoCounts` query — it fetched this week's "No" counts on every load but nothing in the UI ever read it (the "No" badge uses `nosLeftThisWeek`, computed from data already in memory). Also stopped the **double load** on first open: the one-time localStorage migration used to trigger a second full page reload on every visit; `migrateLocalDataToSupabase()` now returns whether it actually migrated anything, and the page only reloads when it did. Changed: `src/app/(app)/page.tsx`, `src/components/BalanceBadge.tsx`, `src/lib/migrate.ts`.
- **2026-07-27** — Repriced Hadrien's account (`hadrienchenleonard@gmail.com`) so a perfect week tops out near S$20 instead of ~S$90. Two parts: (1) lowered his 10 habit dollar values (homework-unprompted S$0.20 down to pencil-case S$0.02, same relative weights as before); (2) added a per-account streak-bonus override (new `user_bonus_config` table + `fetchUserConfig()`) giving him a gentle ladder capped at 1.45x, while keeping the perfect-day double. All other accounts are untouched (no override row → default bonus). His all-time balance re-prices from S$203.93 to ~S$19.83. New files: `supabase-user-bonus.sql`; changed: `src/lib/appConfig.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/rewards/page.tsx`, `src/components/BalanceBadge.tsx`.
- **2026-07-11** — Home page habit cards: the dollar value is now coloured by the day's answer — green for Yes (earned), red for No or Frozen (not earned), gray while unanswered. Changed in `src/app/(app)/page.tsx`.
- **2026-07-10 (late)** — Perfect-day items in the Friends feed now have thumbs-up and comments, exactly like badge items (one thumb per person, tap to undo; comments up to 280 chars, delete your own; not on your own perfect day). New Supabase tables `perfect_day_thumbs` and `perfect_day_comments` (`supabase-perfect-day-reactions.sql`). The thumbs/comments UI in `src/app/(app)/friends/page.tsx` was unified so badges and perfect days share the same code.
- **2026-07-10 23:59** — Home page habit cards: the dollar value now shows the amount **after** the streak multiplier (e.g. a S$1.00 habit on a 14-day streak with a 1.75× multiplier shows +S$1.75), so the card matches what a "Yes" actually pays. Changed in `src/app/(app)/page.tsx`.
- **2026-07-10 22:43** — Bug fix: changing an already-saved check-in answer (e.g. a past day's No to Yes) never reached the database — the save silently failed because the upsert didn't target the right unique columns, so the old answer came back after saving. Fixed the `checkins` upsert (`onConflict: 'habit_id,date'`) and the three `freeze_tokens` upserts (`onConflict: 'user_id,week_start'`) in `src/app/(app)/page.tsx`.
- **2026-07-10** — Added a "Start Habit Tracker.bat" file on the Windows Desktop (outside the repo). Double-clicking it starts the local dev server (or reuses it if already running) and opens http://localhost:3000 in the browser, so the app can be started without Claude.
- **2026-07-10 23:00** — Home page habit cards: streak count text now uses the same font size and weight as the dollar value next to it.
- **2026-07-10 22:55** — Stats page: removed the three overall stat cards at the top (Balance / Days done / Best streak) and their now-unused calculations. The page now starts with the Badges legend card.
- **2026-07-10 22:40** — Home page habit cards: replaced the badge emoji + label text (e.g. "🟤 14-day") with the habit's current streak count (e.g. "12 days"), shown on every habit including those without a badge. The badge itself is still visible via the card's background colour.
- **2026-07-10 22:30** — Streak Bonuses moved from the Settings page to the Admin page, admin-only. Now one points multiplier per badge milestone (7/14/30/90/180/365 days) instead of three tiers, stored in a new shared Supabase `app_config` table so it applies to all users (was per-device localStorage). New `supabase-appconfig.sql` + `src/lib/appConfig.ts`.
- **2026-07-10 22:24** — First badge milestone changed from 5 days to 7 days everywhere (code, docs, badge legend). Existing 5-day badges in the database: upgraded to 7-day for the 15 habits whose history shows a streak of 7+ days; removed for the 4 habits that only ever reached 5 days (they will auto-earn the 7-day badge when they hit 7).
- **2026-07-10 (earlier)** — Added a "Badges" legend card to the Stats page, under the overall stats, showing all six badge colors with their day counts.
