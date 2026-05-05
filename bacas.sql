-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.active_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  user_name text NOT NULL,
  check_in_time timestamp with time zone DEFAULT now(),
  CONSTRAINT active_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT active_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.emergency_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  contact_name text NOT NULL,
  contact_number text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT emergency_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT emergency_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.liability_waivers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  signature_name text NOT NULL,
  signed_date timestamp with time zone DEFAULT now(),
  waiver_accepted boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT liability_waivers_pkey PRIMARY KEY (id),
  CONSTRAINT liability_waivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.medical_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
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
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT medical_history_pkey PRIMARY KEY (id),
  CONSTRAINT medical_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.payment (
  payment_id text NOT NULL,
  user_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  payment_method character varying NOT NULL CHECK (payment_method::text = ANY (ARRAY['cash'::character varying, 'gcash'::character varying, 'paymaya'::character varying, 'banktransfer'::character varying]::text[])),
  payment_date timestamp with time zone NOT NULL,
  reference_number character varying,
  notes text,
  payment_for character varying NOT NULL CHECK (payment_for::text = ANY (ARRAY['membership'::character varying, 'coaching'::character varying, 'both'::character varying, 'other'::character varying]::text[])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_pkey PRIMARY KEY (payment_id),
  CONSTRAINT payment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.scan_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text NOT NULL,
  timestamp timestamp with time zone DEFAULT now(),
  action text NOT NULL CHECK (action = ANY (ARRAY['check-in'::text, 'check-out'::text, 'not-applicable'::text])),
  status text NOT NULL DEFAULT 'success'::text CHECK (status = ANY (ARRAY['success'::text, 'expired'::text, 'invalid'::text])),
  CONSTRAINT scan_logs_pkey PRIMARY KEY (id),
  CONSTRAINT scan_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.subscription_history (
  id text NOT NULL,
  user_id text NOT NULL,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_history_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  start_date timestamp with time zone NOT NULL,
  end_date timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text])),
  created_at timestamp with time zone DEFAULT now(),
  plan_duration text CHECK (plan_duration = ANY (ARRAY['1 month'::text, '6 months'::text, '12 months'::text, 'daily'::text, 'walk-in'::text])),
  membership_type text CHECK (membership_type = ANY (ARRAY['new'::text, 'renewal'::text, 'walk-in'::text])),
  coaching_preference boolean DEFAULT false,
  payment_status text NOT NULL DEFAULT 'not paid'::text CHECK (payment_status = ANY (ARRAY['paid'::text, 'not paid'::text])),
  payment_date timestamp with time zone,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.user_id_counter (
  id integer NOT NULL DEFAULT 1,
  last_number integer DEFAULT 1000,
  CONSTRAINT user_id_counter_pkey PRIMARY KEY (id)
);
CREATE TABLE public.users (
  user_id text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  height_cm numeric,
  weight_kg numeric,
  birthday date,
  age integer,
  address text,
  goal text,
  program_type text,
  CONSTRAINT users_pkey PRIMARY KEY (user_id)
);