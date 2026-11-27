-- The merchant name sync itself last wrote to a transaction (the bank's name, after any rename
-- rule). While `merchant` still equals it, nobody has edited the name, so later provider updates
-- (modified, pending -> posted) may refresh it; once they differ the user changed it, and sync
-- leaves `merchant` alone.
--
-- Existing rows start NULL: there's no record of which names were hand-edited, so they're all
-- treated as user-owned and never overwritten (the cautious choice). Exception: a NULL merchant
-- also matches a NULL provider_merchant, so a blank name can still be filled in.
ALTER TABLE transactions ADD COLUMN provider_merchant TEXT;
