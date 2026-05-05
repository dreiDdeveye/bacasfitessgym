-- Bacas Fitness Gym database migration
-- Run this in Supabase SQL Editor after the project is active.
-- It is intentionally idempotent so it can upgrade an older schema without
-- dropping existing member, subscription, scan, or payment data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
  user_id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  height_cm numeric,
  weight_kg numeric,
  birthday date,
  age integer,
  address text,
  goal text,
  program_type text
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS program_type text;

ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE TABLE IF NOT EXISTS public.user_id_counter (
  id integer PRIMARY KEY DEFAULT 1,
  last_number integer DEFAULT 1000
);

INSERT INTO public.user_id_counter (id, last_number)
VALUES (1, 1000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  plan_duration text,
  membership_type text,
  coaching_preference boolean DEFAULT false,
  payment_status text NOT NULL DEFAULT 'not paid',
  payment_date timestamptz
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_duration text,
  ADD COLUMN IF NOT EXISTS membership_type text,
  ADD COLUMN IF NOT EXISTS coaching_preference boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not paid',
  ADD COLUMN IF NOT EXISTS payment_date timestamptz;

CREATE TABLE IF NOT EXISTS public.subscription_history (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  status text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  user_name text NOT NULL,
  "timestamp" timestamptz DEFAULT now(),
  action text NOT NULL,
  status text NOT NULL DEFAULT 'success'
);

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  user_name text NOT NULL,
  check_in_time timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medical_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  heart_problems boolean DEFAULT false,
  blood_pressure_problems boolean DEFAULT false,
  chest_pain_exercising boolean DEFAULT false,
  asthma_breathing_problems boolean DEFAULT false,
  joint_problems boolean DEFAULT false,
  neck_back_problems boolean DEFAULT false,
  pregnant_recent_birth boolean DEFAULT false,
  other_medical_conditions boolean DEFAULT false,
  other_medical_details text,
  smoking boolean DEFAULT false,
  medication boolean DEFAULT false,
  medication_details text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_number text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liability_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  signature_name text NOT NULL,
  signed_date timestamptz DEFAULT now(),
  waiver_accepted boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment (
  payment_id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method varchar NOT NULL,
  payment_date timestamptz NOT NULL,
  reference_number varchar,
  notes text,
  payment_for varchar NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment
  ADD COLUMN IF NOT EXISTS reference_number varchar,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Recreate check constraints so older schemas get the current allowed values.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'expired', 'cancelled'));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_duration_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_duration_check
  CHECK (plan_duration IS NULL OR plan_duration IN ('1 month', '6 months', '12 months', 'daily', 'walk-in'));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_membership_type_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_membership_type_check
  CHECK (membership_type IS NULL OR membership_type IN ('new', 'renewal', 'walk-in'));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_status_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_payment_status_check
  CHECK (payment_status IN ('paid', 'not paid'));

ALTER TABLE public.subscription_history DROP CONSTRAINT IF EXISTS subscription_history_status_check;
ALTER TABLE public.subscription_history
  ADD CONSTRAINT subscription_history_status_check
  CHECK (status IN ('active', 'expired', 'cancelled'));

ALTER TABLE public.scan_logs DROP CONSTRAINT IF EXISTS scan_logs_action_check;
ALTER TABLE public.scan_logs
  ADD CONSTRAINT scan_logs_action_check
  CHECK (action IN ('check-in', 'check-out', 'not-applicable'));

ALTER TABLE public.scan_logs DROP CONSTRAINT IF EXISTS scan_logs_status_check;
ALTER TABLE public.scan_logs
  ADD CONSTRAINT scan_logs_status_check
  CHECK (status IN ('success', 'expired', 'invalid'));

ALTER TABLE public.payment DROP CONSTRAINT IF EXISTS payment_amount_check;
ALTER TABLE public.payment
  ADD CONSTRAINT payment_amount_check
  CHECK (amount > 0);

ALTER TABLE public.payment DROP CONSTRAINT IF EXISTS payment_payment_method_check;
ALTER TABLE public.payment
  ADD CONSTRAINT payment_payment_method_check
  CHECK (payment_method IN ('cash', 'gcash', 'paymaya', 'banktransfer'));

ALTER TABLE public.payment DROP CONSTRAINT IF EXISTS payment_payment_for_check;
ALTER TABLE public.payment
  ADD CONSTRAINT payment_payment_for_check
  CHECK (payment_for IN ('membership', 'coaching', 'both', 'other'));

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON public.subscription_history(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_user_id ON public.scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_timestamp ON public.scan_logs("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON public.active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_history_user_id ON public.medical_history(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_user_id ON public.emergency_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_liability_waivers_user_id ON public.liability_waivers(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_user_id ON public.payment(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_payment_date ON public.payment(payment_date DESC);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_id_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liability_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_table text;
BEGIN
  FOREACH policy_table IN ARRAY ARRAY[
    'users',
    'subscriptions',
    'subscription_history',
    'scan_logs',
    'active_sessions',
    'user_id_counter',
    'medical_history',
    'emergency_contacts',
    'liability_waivers',
    'payment'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = policy_table
        AND policyname = 'Allow all access to ' || policy_table
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
        'Allow all access to ' || policy_table,
        policy_table
      );
    END IF;
  END LOOP;
END $$;

UPDATE public.user_id_counter
SET last_number = GREATEST(
  COALESCE(last_number, 1000),
  COALESCE((
    SELECT max(substring(user_id FROM 'BCF-([0-9]+)')::integer)
    FROM public.users
    WHERE user_id ~ '^BCF-[0-9]+$'
  ), 1000)
)
WHERE id = 1;
