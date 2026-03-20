-- Payment Methods table
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          text    NOT NULL CHECK (type IN ('upi', 'bank_account', 'card')),
  label         text    NOT NULL,
  details       jsonb   NOT NULL DEFAULT '{}',
  is_default    boolean NOT NULL DEFAULT false,
  is_verified   boolean NOT NULL DEFAULT false,
  created_at    timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.payment_methods(user_id);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment methods"
  ON public.payment_methods FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add own payment methods"
  ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own payment methods"
  ON public.payment_methods FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own payment methods"
  ON public.payment_methods FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
