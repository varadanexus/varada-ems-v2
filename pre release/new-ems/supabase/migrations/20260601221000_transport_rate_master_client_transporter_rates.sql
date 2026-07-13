-- SPRINT 6D: ensure transport_rate_master has explicit client/transporter rate columns
-- Non-destructive

ALTER TABLE IF EXISTS transport_rate_master
  ADD COLUMN IF NOT EXISTS client_rate_per_mt numeric;

ALTER TABLE IF EXISTS transport_rate_master
  ADD COLUMN IF NOT EXISTS transporter_rate_per_mt numeric;
