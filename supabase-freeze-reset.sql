-- Clear stale freeze flags.
-- Confirmed safe: there are zero check-ins with response = 'freeze' in the
-- whole database, so no "used = true" flag corresponds to a real freeze.
-- This resets them all to unused, giving every week its freeze back.
-- Run in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new

update freeze_tokens set used = false where used = true;
