
-- =============================================
-- 1. ADMIN RBAC: app_role enum + user_roles + has_role()
-- =============================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role    NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage roles" ON public.user_roles;
CREATE POLICY "Service role can manage roles"
  ON public.user_roles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- =============================================
-- 2. ATOMIC BET PLACEMENT — race-condition-safe
-- =============================================
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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF p_stake <= 0 THEN
    RETURN jsonb_build_object('error', 'invalid_stake');
  END IF;

  -- Lock the wallet row for this user (prevents concurrent race conditions)
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
    'success', true,
    'bet_id', v_bet_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- =============================================
-- 3. NOTIFICATIONS TABLE (persistent + realtime)
-- =============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL DEFAULT 'info',
  title        text        NOT NULL,
  body         text,
  read         boolean     NOT NULL DEFAULT false,
  reference_id text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
CREATE POLICY "Service role can manage all notifications"
  ON public.notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read)
  WHERE read = false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
