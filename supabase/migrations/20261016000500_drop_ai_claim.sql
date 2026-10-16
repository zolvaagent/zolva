-- The app now claims AI reviews with ai_claim_review (budget checked in the
-- same call), deployed 2026-10-16, so the old function goes.
drop function if exists ai_claim(uuid, text, timestamptz, text);
