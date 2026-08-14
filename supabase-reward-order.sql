-- Reward ordering Setup
-- Run this in: https://xkgukvmrdvkiwvcyrdop.supabase.co/project/default/sql/new
--
-- The up/down arrows on the rewards page used to save their order in the
-- browser (localStorage), so it never followed the user between devices.
-- sort_order stores it on the account instead. Null means "never ordered",
-- which sorts last, so brand new rewards land at the bottom of the list.

alter table wishlist_items add column if not exists sort_order integer;
