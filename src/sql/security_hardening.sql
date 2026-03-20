-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Fixes: balance consistency, idempotency, risk perf,
--        fraud cooldown, withdrawal locking, audit trail
-- ============================================================

-- ============================================================
-- 1. BALANCE CONSISTENCY (Option B)
--    Keep wallet_balances as source of truth.
--    Fix wallet_debit/credit to use wallet_balances (not profiles).
--    Add locked_balance column. Add reconciliation function.
-- ============================================================

ALTER TABLE public.wallet_balances
  ADD COLUMN IF NOT EXISTS locked_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- Fix wallet_debit to use wallet_balances table
CREATE OR REPLACE FUNCTION public.wallet_debit(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_description text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_tx_id uuid;
  v_existing uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT balance INTO v_balance FROM wallet_balances WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_balance, p_amount;
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE wallet_balances SET balance = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, balance_after, description, status, idempotency_key)
  VALUES (p_user_id, p_type, -p_amount, v_new_balance, p_description, 'completed', p_idempotency_key)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transaction_id', v_tx_id);
END;
$$;

-- Fix wallet_credit to use wallet_balances table
CREATE OR REPLACE FUNCTION public.wallet_credit(
  p_user_id uuid,
  p_amount numeric,
  p_type text,
  p_description text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance numeric;
  v_new_balance numeric;
  v_tx_id uuid;
  v_existing uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT balance INTO v_balance FROM wallet_balances WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE wallet_balances SET balance = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, balance_after, description, status, idempotency_key)
  VALUES (p_user_id, p_type, p_amount, v_new_balance, p_description, 'completed', p_idempotency_key)
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transaction_id', v_tx_id);
END;
$$;

-- Fix wallet_get_balance to use wallet_balances
CREATE OR REPLACE FUNCTION public.wallet_get_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT balance, bonus_balance, locked_balance INTO v_row
  FROM wallet_balances WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('balance', 0, 'bonus_balance', 0, 'locked_balance', 0);
  END IF;
  RETURN jsonb_build_object(
    'balance', v_row.balance,
    'bonus_balance', v_row.bonus_balance,
    'locked_balance', v_row.locked_balance
  );
END;
$$;

-- Reconciliation function
CREATE OR REPLACE FUNCTION public.reconcile_balance(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stored numeric;
  v_calculated numeric;
  v_initial_credit numeric := 1000.00;
  v_diff numeric;
BEGIN
  SELECT balance INTO v_stored FROM wallet_balances WHERE user_id = p_user_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_calculated
  FROM transactions WHERE user_id = p_user_id AND status = 'completed';
  v_calculated := v_calculated + v_initial_credit;
  v_diff := v_stored - v_calculated;
  RETURN jsonb_build_object(
    'user_id', p_user_id, 'stored_balance', v_stored,
    'calculated_balance', v_calculated, 'difference', v_diff,
    'in_sync', (abs(v_diff) < 0.01)
  );
END;
$$;

-- ============================================================
-- 2. IDEMPOTENCY: Add unique column to transactions
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_transactions_idempotency
  ON public.transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 3. RISK TRIGGER PERFORMANCE: Pre-aggregated stats tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_stats_hourly (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_bucket timestamptz NOT NULL,
  tx_count    integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  bet_count   integer NOT NULL DEFAULT 0,
  win_count   integer NOT NULL DEFAULT 0,
  win_amount  numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, hour_bucket)
);

CREATE TABLE IF NOT EXISTS public.user_stats_daily (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_bucket  date NOT NULL,
  tx_count    integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  bet_count   integer NOT NULL DEFAULT 0,
  win_count   integer NOT NULL DEFAULT 0,
  win_amount  numeric(12,2) NOT NULL DEFAULT 0,
  deposit_amount numeric(12,2) NOT NULL DEFAULT 0,
  withdrawal_amount numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE(user_id, day_bucket)
);

ALTER TABLE public.user_stats_hourly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hourly stats" ON public.user_stats_hourly
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can view own daily stats" ON public.user_stats_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Trigger to maintain stats on transaction insert
CREATE OR REPLACE FUNCTION public.update_user_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hour timestamptz := date_trunc('hour', NEW.created_at);
  v_day  date := (NEW.created_at AT TIME ZONE 'UTC')::date;
  v_is_bet boolean := (NEW.type = 'bet_placed');
  v_is_win boolean := (NEW.type = 'bet_win');
  v_is_deposit boolean := (NEW.type = 'deposit');
  v_is_withdrawal boolean := (NEW.type = 'withdrawal');
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  INSERT INTO user_stats_hourly (user_id, hour_bucket, tx_count, total_amount, bet_count, win_count, win_amount)
  VALUES (NEW.user_id, v_hour, 1, abs(NEW.amount),
    CASE WHEN v_is_bet THEN 1 ELSE 0 END,
    CASE WHEN v_is_win THEN 1 ELSE 0 END,
    CASE WHEN v_is_win THEN NEW.amount ELSE 0 END)
  ON CONFLICT (user_id, hour_bucket) DO UPDATE SET
    tx_count = user_stats_hourly.tx_count + 1,
    total_amount = user_stats_hourly.total_amount + abs(NEW.amount),
    bet_count = user_stats_hourly.bet_count + CASE WHEN v_is_bet THEN 1 ELSE 0 END,
    win_count = user_stats_hourly.win_count + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    win_amount = user_stats_hourly.win_amount + CASE WHEN v_is_win THEN NEW.amount ELSE 0 END;

  INSERT INTO user_stats_daily (user_id, day_bucket, tx_count, total_amount, bet_count, win_count, win_amount, deposit_amount, withdrawal_amount)
  VALUES (NEW.user_id, v_day, 1, abs(NEW.amount),
    CASE WHEN v_is_bet THEN 1 ELSE 0 END,
    CASE WHEN v_is_win THEN 1 ELSE 0 END,
    CASE WHEN v_is_win THEN NEW.amount ELSE 0 END,
    CASE WHEN v_is_deposit THEN NEW.amount ELSE 0 END,
    CASE WHEN v_is_withdrawal THEN abs(NEW.amount) ELSE 0 END)
  ON CONFLICT (user_id, day_bucket) DO UPDATE SET
    tx_count = user_stats_daily.tx_count + 1,
    total_amount = user_stats_daily.total_amount + abs(NEW.amount),
    bet_count = user_stats_daily.bet_count + CASE WHEN v_is_bet THEN 1 ELSE 0 END,
    win_count = user_stats_daily.win_count + CASE WHEN v_is_win THEN 1 ELSE 0 END,
    win_amount = user_stats_daily.win_amount + CASE WHEN v_is_win THEN NEW.amount ELSE 0 END,
    deposit_amount = user_stats_daily.deposit_amount + CASE WHEN v_is_deposit THEN NEW.amount ELSE 0 END,
    withdrawal_amount = user_stats_daily.withdrawal_amount + CASE WHEN v_is_withdrawal THEN abs(NEW.amount) ELSE 0 END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_user_stats ON public.transactions;
CREATE TRIGGER trg_update_user_stats
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_stats();

-- Updated risk evaluation using pre-aggregated stats
CREATE OR REPLACE FUNCTION public.evaluate_risk_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_risk_score integer := 0;
  v_risk_level text := 'low';
  v_flags text[] := '{}';
  v_hourly_tx integer;
  v_daily record;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT COALESCE(tx_count, 0) INTO v_hourly_tx
  FROM user_stats_hourly
  WHERE user_id = NEW.user_id AND hour_bucket = date_trunc('hour', now());

  SELECT
    COALESCE(SUM(bet_count), 0) AS total_bets,
    COALESCE(SUM(win_count), 0) AS total_wins,
    COALESCE(SUM(deposit_amount), 0) AS total_deposited,
    COALESCE(SUM(withdrawal_amount), 0) AS total_withdrawn,
    COALESCE(SUM(win_amount), 0) AS total_win_amount
  INTO v_daily
  FROM user_stats_daily
  WHERE user_id = NEW.user_id;

  IF v_hourly_tx > 20 THEN
    v_risk_score := v_risk_score + 25;
    v_flags := array_append(v_flags, 'high_velocity');
  ELSIF v_hourly_tx > 10 THEN
    v_risk_score := v_risk_score + 10;
  END IF;

  IF v_daily.total_bets > 20 THEN
    IF v_daily.total_wins::float / v_daily.total_bets > 0.75 THEN
      v_risk_score := v_risk_score + 30;
      v_flags := array_append(v_flags, 'abnormal_win_rate');
    ELSIF v_daily.total_wins::float / v_daily.total_bets > 0.60 THEN
      v_risk_score := v_risk_score + 15;
    END IF;
  END IF;

  IF v_daily.total_deposited > 0 AND v_daily.total_withdrawn > v_daily.total_deposited * 3 THEN
    v_risk_score := v_risk_score + 20;
    v_flags := array_append(v_flags, 'withdrawal_deposit_mismatch');
  END IF;

  IF v_daily.total_win_amount > 50000 THEN
    v_risk_score := v_risk_score + 15;
    v_flags := array_append(v_flags, 'high_win_volume');
  END IF;

  IF v_risk_score >= 75 THEN v_risk_level := 'critical';
  ELSIF v_risk_score >= 50 THEN v_risk_level := 'high';
  ELSIF v_risk_score >= 25 THEN v_risk_level := 'medium';
  ELSE v_risk_level := 'low';
  END IF;

  INSERT INTO user_risk_scores (user_id, risk_score, risk_level, flags, last_evaluated_at)
  VALUES (NEW.user_id, v_risk_score, v_risk_level, v_flags, now())
  ON CONFLICT (user_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_level = EXCLUDED.risk_level,
    flags = EXCLUDED.flags,
    last_evaluated_at = now();

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. FRAUD TRIGGER COOLDOWN
-- ============================================================

ALTER TABLE public.user_risk_scores
  ADD COLUMN IF NOT EXISTS consecutive_high_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz;

CREATE OR REPLACE FUNCTION public.enforce_fraud_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old_status text;
BEGIN
  v_old_status := COALESCE(OLD.account_status, 'active');

  IF NEW.risk_score >= 75 THEN
    NEW.consecutive_high_count := COALESCE(OLD.consecutive_high_count, 0) + 1;
  ELSE
    NEW.consecutive_high_count := 0;
  END IF;

  -- Require 3+ consecutive critical evals AND 1hr cooldown
  IF NEW.risk_score >= 75
     AND NEW.consecutive_high_count >= 3
     AND v_old_status = 'active'
     AND (OLD.last_status_change_at IS NULL OR OLD.last_status_change_at < now() - interval '1 hour')
  THEN
    NEW.account_status := 'restricted';
    NEW.last_status_change_at := now();

    INSERT INTO account_status_logs (user_id, old_status, new_status, reason, triggered_by)
    VALUES (NEW.user_id, v_old_status, 'restricted',
      'Auto: risk_score=' || NEW.risk_score || ' sustained 3+ times', 'system');

    INSERT INTO notifications (user_id, type, title, body)
    VALUES (NEW.user_id, 'security', 'Account Restricted',
      'Your account has been restricted due to unusual activity. Contact support for review.');
  END IF;

  -- Suspend: already restricted + score>=90 + 5+ consecutive + 6hr cooldown
  IF NEW.risk_score >= 90
     AND NEW.consecutive_high_count >= 5
     AND v_old_status = 'restricted'
     AND (OLD.last_status_change_at IS NULL OR OLD.last_status_change_at < now() - interval '6 hours')
  THEN
    NEW.account_status := 'suspended';
    NEW.last_status_change_at := now();

    INSERT INTO account_status_logs (user_id, old_status, new_status, reason, triggered_by)
    VALUES (NEW.user_id, 'restricted', 'suspended',
      'Auto: risk_score=' || NEW.risk_score || ' sustained 5+ times', 'system');

    INSERT INTO notifications (user_id, type, title, body)
    VALUES (NEW.user_id, 'security', 'Account Suspended',
      'Your account has been suspended pending review.');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. WITHDRAWAL FUND LOCKING
-- ============================================================

CREATE OR REPLACE FUNCTION public.wallet_withdraw_with_checks(
  p_user_id uuid,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_risk record;
  v_balance numeric;
  v_locked numeric;
  v_new_balance numeric;
  v_new_locked numeric;
  v_tx_id uuid;
  v_existing uuid;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE idempotency_key = p_idempotency_key;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
    END IF;
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT * INTO v_risk FROM user_risk_scores WHERE user_id = p_user_id;

  IF v_risk IS NOT NULL AND v_risk.account_status IN ('suspended', 'blocked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is ' || v_risk.account_status);
  END IF;

  -- Lock wallet row
  SELECT balance, locked_balance INTO v_balance, v_locked
  FROM wallet_balances WHERE user_id = p_user_id FOR UPDATE;

  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Move funds to locked_balance FIRST (prevents double-spend)
  v_new_balance := v_balance - p_amount;
  v_new_locked := COALESCE(v_locked, 0) + p_amount;

  UPDATE wallet_balances
  SET balance = v_new_balance, locked_balance = v_new_locked, updated_at = now()
  WHERE user_id = p_user_id;

  IF v_risk IS NOT NULL AND v_risk.risk_level IN ('high', 'critical') AND p_amount > 1000 THEN
    INSERT INTO transactions (user_id, type, amount, balance_after, description, status, idempotency_key)
    VALUES (p_user_id, 'withdrawal', -p_amount, v_new_balance, p_description, 'pending', p_idempotency_key)
    RETURNING id INTO v_tx_id;

    INSERT INTO notifications (user_id, type, title, body)
    VALUES (p_user_id, 'transaction', 'Withdrawal Under Review',
      'Your withdrawal of ₹' || p_amount || ' is under review. Funds are held securely.');

    RETURN jsonb_build_object('success', true, 'status', 'pending', 'transaction_id', v_tx_id);
  ELSE
    INSERT INTO transactions (user_id, type, amount, balance_after, description, status, idempotency_key)
    VALUES (p_user_id, 'withdrawal', -p_amount, v_new_balance, p_description, 'completed', p_idempotency_key)
    RETURNING id INTO v_tx_id;

    -- Release from locked
    UPDATE wallet_balances
    SET locked_balance = locked_balance - p_amount, updated_at = now()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'status', 'completed', 'balance', v_new_balance, 'transaction_id', v_tx_id);
  END IF;
END;
$$;

-- ============================================================
-- 6. ACCOUNT STATUS AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.account_status_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status  text NOT NULL,
  new_status  text NOT NULL,
  reason      text,
  triggered_by text NOT NULL DEFAULT 'system',
  admin_id    uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_status_logs_user ON public.account_status_logs(user_id, created_at DESC);

ALTER TABLE public.account_status_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own status logs" ON public.account_status_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all status logs" ON public.account_status_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages status logs" ON public.account_status_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
