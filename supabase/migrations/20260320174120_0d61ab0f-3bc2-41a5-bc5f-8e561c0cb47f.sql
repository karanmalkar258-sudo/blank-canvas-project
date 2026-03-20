
-- ============================================================
-- 1. ATOMIC WALLET FUNCTIONS (replaces client-side balance math)
-- ============================================================

-- Atomic debit: returns new balance or raises exception
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
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE metadata->>'idempotency_key' = p_idempotency_key::text;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  -- Lock the row for update to prevent race conditions
  SELECT balance INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: have %, need %', v_balance, p_amount;
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE profiles SET balance = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, description, status, metadata)
  VALUES (
    p_user_id, p_type, -p_amount, p_description, 'completed',
    CASE WHEN p_idempotency_key IS NOT NULL 
      THEN jsonb_build_object('idempotency_key', p_idempotency_key, 'balance_after', v_new_balance)
      ELSE jsonb_build_object('balance_after', v_new_balance)
    END
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transaction_id', v_tx_id);
END;
$$;

-- Atomic credit: deposits, wins, bonuses
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
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM transactions WHERE metadata->>'idempotency_key' = p_idempotency_key::text;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'transaction_id', v_existing);
    END IF;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  SELECT balance INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_new_balance := v_balance + p_amount;

  UPDATE profiles SET balance = v_new_balance, updated_at = now() WHERE user_id = p_user_id;

  INSERT INTO transactions (user_id, type, amount, description, status, metadata)
  VALUES (
    p_user_id, p_type, p_amount, p_description, 'completed',
    CASE WHEN p_idempotency_key IS NOT NULL 
      THEN jsonb_build_object('idempotency_key', p_idempotency_key, 'balance_after', v_new_balance)
      ELSE jsonb_build_object('balance_after', v_new_balance)
    END
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transaction_id', v_tx_id);
END;
$$;

-- Get current balance (single source of truth)
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
  SELECT balance, total_wagered, total_profit INTO v_row FROM profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('balance', 0, 'total_wagered', 0, 'total_profit', 0);
  END IF;
  RETURN jsonb_build_object('balance', v_row.balance, 'total_wagered', v_row.total_wagered, 'total_profit', v_row.total_profit);
END;
$$;

-- ============================================================
-- 2. REACTIVE RISK SCORING (event-driven, not static)
-- ============================================================

-- Risk evaluation function called by trigger after transactions
CREATE OR REPLACE FUNCTION public.evaluate_risk_after_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_risk_score integer := 0;
  v_risk_level text := 'low';
  v_flags text[] := '{}';
  v_tx_count_1h integer;
  v_large_win_count integer;
  v_total_deposited numeric;
  v_total_withdrawn numeric;
BEGIN
  -- Only evaluate on completed transactions
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT * INTO v_profile FROM profiles WHERE user_id = NEW.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Count transactions in last hour (velocity check)
  SELECT count(*) INTO v_tx_count_1h
  FROM transactions
  WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';

  -- Count large wins (>10x deposit pattern)
  SELECT count(*) INTO v_large_win_count
  FROM transactions
  WHERE user_id = NEW.user_id AND type = 'bet_win' AND amount > 5000;

  -- Total deposits vs withdrawals ratio
  SELECT COALESCE(sum(amount), 0) INTO v_total_deposited
  FROM transactions WHERE user_id = NEW.user_id AND type = 'deposit' AND amount > 0;

  SELECT COALESCE(sum(abs(amount)), 0) INTO v_total_withdrawn
  FROM transactions WHERE user_id = NEW.user_id AND type = 'withdrawal';

  -- Scoring rules (non-linear, harder to game)
  -- Rule 1: High velocity transactions
  IF v_tx_count_1h > 20 THEN
    v_risk_score := v_risk_score + 25;
    v_flags := array_append(v_flags, 'high_velocity');
  ELSIF v_tx_count_1h > 10 THEN
    v_risk_score := v_risk_score + 10;
  END IF;

  -- Rule 2: Win rate anomaly (only if enough bets)
  IF v_profile.total_bets > 20 THEN
    IF v_profile.total_wins::float / v_profile.total_bets > 0.75 THEN
      v_risk_score := v_risk_score + 30;
      v_flags := array_append(v_flags, 'abnormal_win_rate');
    ELSIF v_profile.total_wins::float / v_profile.total_bets > 0.60 THEN
      v_risk_score := v_risk_score + 15;
    END IF;
  END IF;

  -- Rule 3: Withdrawal exceeds deposits significantly (potential bonus abuse)
  IF v_total_deposited > 0 AND v_total_withdrawn > v_total_deposited * 3 THEN
    v_risk_score := v_risk_score + 20;
    v_flags := array_append(v_flags, 'withdrawal_deposit_mismatch');
  END IF;

  -- Rule 4: Large sudden wins
  IF v_large_win_count > 5 THEN
    v_risk_score := v_risk_score + 15;
    v_flags := array_append(v_flags, 'frequent_large_wins');
  END IF;

  -- Determine level
  IF v_risk_score >= 75 THEN v_risk_level := 'critical';
  ELSIF v_risk_score >= 50 THEN v_risk_level := 'high';
  ELSIF v_risk_score >= 25 THEN v_risk_level := 'medium';
  ELSE v_risk_level := 'low';
  END IF;

  -- Upsert into a risk_scores table (lightweight, just scoring)
  INSERT INTO public.user_risk_scores (user_id, risk_score, risk_level, flags, last_evaluated_at)
  VALUES (NEW.user_id, v_risk_score, v_risk_level, v_flags, now())
  ON CONFLICT (user_id) DO UPDATE SET
    risk_score = EXCLUDED.risk_score,
    risk_level = EXCLUDED.risk_level,
    flags = EXCLUDED.flags,
    last_evaluated_at = now();

  RETURN NEW;
END;
$$;

-- Create risk scores table
CREATE TABLE IF NOT EXISTS public.user_risk_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  account_status text NOT NULL DEFAULT 'active',
  flags text[] NOT NULL DEFAULT '{}',
  last_evaluated_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_risk_scores ENABLE ROW LEVEL SECURITY;

-- Admins can see all, users can see own
CREATE POLICY "Users can view own risk score"
  ON public.user_risk_scores FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger: evaluate risk after every transaction
CREATE TRIGGER trg_evaluate_risk_after_tx
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.evaluate_risk_after_transaction();

-- ============================================================
-- 3. FRAUD RULE ENGINE (concrete rules, auto-enforcement)
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_fraud_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
BEGIN
  -- Auto-restrict if risk is critical
  IF NEW.risk_score >= 75 AND NEW.account_status = 'active' THEN
    NEW.account_status := 'restricted';
    
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (NEW.user_id, 'Account Restricted', 
      'Your account has been restricted due to unusual activity. Contact support for review.',
      'security');
  END IF;

  -- Auto-suspend if risk stays critical and already restricted
  IF NEW.risk_score >= 90 AND NEW.account_status = 'restricted' THEN
    NEW.account_status := 'suspended';
    
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (NEW.user_id, 'Account Suspended', 
      'Your account has been suspended pending review.',
      'security');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: enforce fraud rules when risk score changes
CREATE TRIGGER trg_enforce_fraud_rules
  BEFORE INSERT OR UPDATE ON public.user_risk_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fraud_rules();

-- Withdrawal hold function: called before withdrawal to check
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
  v_result jsonb;
  v_today_withdrawn numeric;
BEGIN
  -- Check account status
  SELECT * INTO v_risk FROM user_risk_scores WHERE user_id = p_user_id;
  
  IF v_risk IS NOT NULL AND v_risk.account_status IN ('suspended', 'blocked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account is ' || v_risk.account_status || '. Withdrawals disabled.');
  END IF;

  -- Check daily withdrawal velocity
  SELECT COALESCE(sum(abs(amount)), 0) INTO v_today_withdrawn
  FROM transactions
  WHERE user_id = p_user_id 
    AND type = 'withdrawal' 
    AND created_at > date_trunc('day', now());

  -- Hold large withdrawals from new or risky accounts
  IF v_risk IS NOT NULL AND v_risk.risk_level IN ('high', 'critical') AND p_amount > 1000 THEN
    -- Create pending withdrawal instead of immediate
    INSERT INTO transactions (user_id, type, amount, description, status, metadata)
    VALUES (p_user_id, 'withdrawal', -p_amount, p_description, 'pending',
      jsonb_build_object('held_reason', 'high_risk_account', 'idempotency_key', COALESCE(p_idempotency_key::text, gen_random_uuid()::text)));
    
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (p_user_id, 'Withdrawal Under Review', 
      'Your withdrawal of ₹' || p_amount || ' is under review. This usually takes 24-48 hours.',
      'transaction');
    
    RETURN jsonb_build_object('success', true, 'status', 'pending', 'message', 'Withdrawal under review');
  END IF;

  -- Normal withdrawal via atomic debit
  v_result := wallet_debit(p_user_id, p_amount, 'withdrawal', p_description, p_idempotency_key);
  RETURN v_result;
END;
$$;
