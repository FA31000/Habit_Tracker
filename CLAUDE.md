@AGENTS.md

# Testing the App

To log in and test the live app, use these credentials:

- Email: `fa.leonard@gmail.com`
- Password: `Daijedf1453`

# Pushing to GitHub

This repo is `FA31000/Habit_Tracker`. Push to it as the **FA31000** account.

Git on this machine authenticates to github.com via the **GitHub CLI** (`gh`),
configured in `C:/Users/FA/.gitconfig`. Pushes use whatever account is
**active** in `gh`. The machine has multiple GitHub accounts logged in
(`FA31000`, `fa844`, `faleonard-abilitie`), so the wrong one can be active.

If a push fails with `Permission ... denied to faleonard-abilitie` (403):
1. Check the active account: `gh auth status`
2. Switch it to FA31000: `gh auth switch --hostname github.com --user FA31000`
3. Push again: `git push origin main`

Do NOT waste time clearing Windows credentials or looking for tokens — the
active `gh` account is the cause.
