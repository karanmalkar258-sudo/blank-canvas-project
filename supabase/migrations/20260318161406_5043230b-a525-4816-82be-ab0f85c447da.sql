
-- ═══════════════════════════════════════════════════════
-- 1. KYC fields on profiles
-- ═══════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pan_number        text,
  ADD COLUMN IF NOT EXISTS aadhaar_number    text,
  ADD COLUMN IF NOT EXISTS date_of_birth     date,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at  timestamp with time zone,
  ADD COLUMN IF NOT EXISTS kyc_reviewed_at   timestamp with time zone,
  ADD COLUMN IF NOT EXISTS kyc_reject_reason text;

-- ═══════════════════════════════════════════════════════
-- 2. Bet limits config table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bet_limits (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  market_name   text    NOT NULL DEFAULT 'default',
  max_stake     numeric NOT NULL DEFAULT 50000,
  min_stake     numeric NOT NULL DEFAULT 10,
  max_win       numeric NOT NULL DEFAULT 500000,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(market_name)
);

INSERT INTO public.bet_limits (market_name, max_stake, min_stake, max_win)
VALUES ('default', 50000, 10, 500000)
ON CONFLICT (market_name) DO NOTHING;

ALTER TABLE public.bet_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bet limits"
  ON public.bet_limits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages bet limits"
  ON public.bet_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════
-- 3. Market suspension table
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.market_suspensions (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      text    NOT NULL,
  market_name   text    NOT NULL,
  suspended_by  uuid,
  suspended_at  timestamp with time zone NOT NULL DEFAULT now(),
  reason        text,
  UNIQUE(match_id, market_name)
);

ALTER TABLE public.market_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suspensions"
  ON public.market_suspensions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages suspensions"
  ON public.market_suspensions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can manage suspensions"
  ON public.market_suspensions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ═══════════════════════════════════════════════════════
-- 4. Updated place_bet_atomic — enforce limits + suspension
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_match_id        text,
  p_match_title     text,
  p_market_name     text,
  p_selection_label text,
  p_odds            numeric,
  p_stake           numeric,
  p_potential_win   numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid    := auth.uid();
  v_balance     numeric;
  v_new_balance numeric;
  v_bet_id      uuid;
  v_min_stake   numeric;
  v_max_stake   numeric;
  v_max_win     numeric;
  v_suspended   boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF p_stake <= 0 THEN
    RETURN jsonb_build_object('error', 'invalid_stake');
  END IF;

  -- Load limits (market-specific first, then global default)
  SELECT
    COALESCE(specific.min_stake, dflt.min_stake),
    COALESCE(specific.max_stake, dflt.max_stake),
    COALESCE(specific.max_win,   dflt.max_win)
  INTO v_min_stake, v_max_stake, v_max_win
  FROM public.bet_limits dflt
  LEFT JOIN public.bet_limits specific
    ON specific.market_name = p_market_name AND specific.market_name <> 'default'
  WHERE dflt.market_name = 'default'
  LIMIT 1;

  v_min_stake := COALESCE(v_min_stake, 10);
  v_max_stake := COALESCE(v_max_stake, 50000);
  v_max_win   := COALESCE(v_max_win,   500000);

  IF p_stake < v_min_stake THEN
    RETURN jsonb_build_object('error', 'stake_too_low', 'min_stake', v_min_stake);
  END IF;

  IF p_stake > v_max_stake THEN
    RETURN jsonb_build_object('error', 'stake_too_high', 'max_stake', v_max_stake);
  END IF;

  IF p_potential_win > v_max_win THEN
    RETURN jsonb_build_object('error', 'max_win_exceeded', 'max_win', v_max_win);
  END IF;

  -- Market suspension check
  SELECT EXISTS(
    SELECT 1 FROM public.market_suspensions
    WHERE match_id = p_match_id AND market_name = p_market_name
  ) INTO v_suspended;

  IF v_suspended THEN
    RETURN jsonb_build_object('error', 'market_suspended');
  END IF;

  -- Lock wallet row
  SELECT balance INTO v_balance
  FROM public.wallet_balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'wallet_not_found');
  END IF;

  IF v_balance < p_stake THEN
    RETURN jsonb_build_object('error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - p_stake;

  UPDATE public.wallet_balances
  SET balance = v_new_balance, updated_at = now()
  WHERE user_id = v_user_id;

  INSERT INTO public.bets (
    user_id, match_id, match_title, market_name,
    selection_label, odds, stake, potential_win
  )
  VALUES (
    v_user_id, p_match_id, p_match_title, p_market_name,
    p_selection_label, p_odds, p_stake, p_potential_win
  )
  RETURNING id INTO v_bet_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, reference_id)
  VALUES (
    v_user_id, 'bet_placed', -p_stake, v_new_balance,
    p_selection_label || ' · ' || p_market_name,
    v_bet_id::text
  );

  RETURN jsonb_build_object(
    'success',     true,
    'bet_id',      v_bet_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- Trigger for updated_at on bet_limits
CREATE OR REPLACE TRIGGER update_bet_limits_updated_at
  BEFORE UPDATE ON public.bet_limits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
