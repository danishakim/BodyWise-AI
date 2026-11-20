-- BodyWise AI · Supabase schema
-- Run once in Supabase → SQL Editor → New query → paste → Run. Safe to re-run.
--
-- Identity: every visitor is signed in anonymously (no login screen). Linking a Google
-- account later keeps the same auth.users id, so all rows below follow the user.
-- Security: Row-Level Security on every table; a user can only touch rows where
-- user_id = auth.uid(). The AI quota table is server-only (no policies at all).

-- ---------------------------------------------------------------------------
-- 1. profiles: one row per user (the onboarding answers + app preferences)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  sex          text not null check (sex in ('male', 'female')),
  age          smallint not null check (age between 13 and 100),
  height_cm    numeric(4,1) not null check (height_cm between 120 and 230),
  weight_kg    numeric(4,1) not null check (weight_kg between 30 and 300),
  activity     text not null check (activity in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal         text not null check (goal in ('lose', 'maintain', 'gain')),
  target_kg    numeric(4,1) check (target_kg between 30 and 300),
  prefs        jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object'),   -- halal, vegetarian, budget_rm, puasa, dislikes
  theme        text not null default 'light' check (theme in ('light', 'dark')),
  event        jsonb,                                                                       -- Kenduri rebalancer plan
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. plans: the current 7-day AI meal plan + the formula metrics it was built on
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  metrics    jsonb,                     -- BMI, BMR, TDEE, daily_kcal, macros (from /api/assess)
  plan       jsonb,                     -- 7 days × meals (from /api/plan)
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. weight_logs: one weigh-in per user per day (drives the forecast + plateau detector)
-- ---------------------------------------------------------------------------
create table if not exists public.weight_logs (
  user_id    uuid not null references auth.users (id) on delete cascade,
  log_date   date not null,
  kg         numeric(4,1) not null check (kg between 30 and 300),
  created_at timestamptz not null default now(),
  primary key (user_id, log_date)       -- also the index for "my weights, by date"
);

-- ---------------------------------------------------------------------------
-- 4. meal_logs: every food logged (plan, Teachable Machine photo, label, menu, manual)
-- ---------------------------------------------------------------------------
create table if not exists public.meal_logs (
  id         uuid primary key,          -- generated on the device, so offline logs sync without duplicates
  user_id    uuid not null references auth.users (id) on delete cascade,
  log_date   date not null,
  name       text not null check (char_length(name) between 1 and 160),
  kcal       integer not null check (kcal between 0 and 10000),
  protein_g  integer not null default 0 check (protein_g between 0 and 1000),
  slot       text check (char_length(slot) <= 20),
  source     text check (char_length(source) <= 30),
  logged_at  timestamptz not null default now()
);
create index if not exists meal_logs_user_date on public.meal_logs (user_id, log_date);

-- ---------------------------------------------------------------------------
-- 5. chat_messages: AI coach conversation (the app keeps the latest 40)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  text       text not null check (char_length(text) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_user_order on public.chat_messages (user_id, id);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest (never trust the client's clock)
-- ---------------------------------------------------------------------------
create or replace function public.bw_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.bw_touch();
drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans for each row execute function public.bw_touch();

-- ---------------------------------------------------------------------------
-- Row-Level Security: each user sees and changes only their own rows
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'plans', 'weight_logs', 'meal_logs', 'chat_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. ai_quota: per-visitor and global AI limits (server only)
--    Vercel runs FastAPI as serverless functions with no shared memory, so the counters live here.
--    Keys are SHA-256 hashes of IP addresses, never raw IPs.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_quota (
  key          text not null,
  period       text not null check (period in ('minute', 'day')),
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, period, window_start)
);
alter table public.ai_quota enable row level security;   -- no policies → anon/authenticated can't read or write it

-- Count one hit and say which limit (if any) is exceeded: 'minute', 'day' or null (allowed).
create or replace function public.bw_take_quota(p_key text, p_per_min integer, p_per_day integer)
returns text
language plpgsql set search_path = '' as $$
declare
  m integer;
  d integer;
  day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
begin
  if random() < 0.01 then                                   -- occasional cleanup of old windows
    delete from public.ai_quota where window_start < now() - interval '3 days';
  end if;

  insert into public.ai_quota as q (key, period, window_start, hits)
  values (p_key, 'minute', date_trunc('minute', now()), 1)
  on conflict (key, period, window_start) do update set hits = q.hits + 1
  returning hits into m;
  if m > p_per_min then return 'minute'; end if;

  insert into public.ai_quota as q (key, period, window_start, hits)
  values (p_key, 'day', day_start, 1)
  on conflict (key, period, window_start) do update set hits = q.hits + 1
  returning hits into d;
  if d > p_per_day then return 'day'; end if;

  return null;
end $$;

-- Only the server (secret / service_role key) may call it.
revoke all on function public.bw_take_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.bw_take_quota(text, integer, integer) to service_role;
