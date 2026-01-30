-- =============================================
-- TeleTrade RLS Policy Hardening
-- Restricts anon key access, service_role bypasses RLS
-- =============================================

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "Service role full access" ON platform_admins;
DROP POLICY IF EXISTS "Service role full access" ON clients;
DROP POLICY IF EXISTS "Service role full access" ON selling_bots;
DROP POLICY IF EXISTS "Service role full access" ON subscription_plans;
DROP POLICY IF EXISTS "Service role full access" ON subscribers;
DROP POLICY IF EXISTS "Service role full access" ON payment_transactions;
DROP POLICY IF EXISTS "Service role full access" ON access_control_logs;
DROP POLICY IF EXISTS "Service role full access" ON notification_logs;

-- =============================================
-- NEW POLICIES
-- Note: service_role key bypasses RLS entirely in Supabase.
-- These policies only affect the anon key (public access).
-- =============================================

-- subscription_plans: Allow public read for active plans
-- This is needed for selling bots to display plans to subscribers
CREATE POLICY "Public can view active plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true);

-- All other tables have NO public policies.
-- Since RLS is enabled and no SELECT/INSERT/UPDATE/DELETE policy exists,
-- the anon key will be denied access by default.

-- Add comment for documentation
COMMENT ON TABLE subscription_plans IS 'Subscription plans - public read access for active plans only';
COMMENT ON TABLE clients IS 'Client data - service role only';
COMMENT ON TABLE selling_bots IS 'Bot configurations - service role only';
COMMENT ON TABLE subscribers IS 'Subscriber data - service role only';
COMMENT ON TABLE payment_transactions IS 'Payment records - service role only';
COMMENT ON TABLE access_control_logs IS 'Access audit logs - service role only';
COMMENT ON TABLE notification_logs IS 'Notification logs - service role only';
