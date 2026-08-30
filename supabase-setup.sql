-- Lozix 프로필·학습 기록용 데이터베이스 설정
-- Supabase Dashboard → SQL Editor → New query에 이 파일 전체를 붙여넣고 Run 하세요.

-- pgcrypto는 기존 PIN 호환용으로만 사용합니다. 새 PIN 생성에는 gen_salt()를 사용하지 않습니다.
create extension if not exists pgcrypto;

create table if not exists public.lozix_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 24),
  pin_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lozix_profile_data (
  profile_id uuid primary key references public.lozix_profiles(id) on delete cascade,
  records jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.lozix_profiles enable row level security;
alter table public.lozix_profile_data enable row level security;
revoke all on public.lozix_profiles, public.lozix_profile_data from anon, authenticated;

create or replace function public.lozix_assert_pin(profile_id uuid, profile_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.lozix_profiles
    where id = profile_id and (pin_hash = md5('lozix-pin-v1:' || profile_pin) or pin_hash = extensions.crypt(profile_pin, pin_hash))
  ) then
    raise exception 'PIN이 맞지 않습니다.';
  end if;
end;
$$;

create or replace function public.list_lozix_profiles()
returns table(id uuid, name text) language sql security definer set search_path = public as $$
  select id, name from public.lozix_profiles order by created_at asc;
$$;

create or replace function public.create_lozix_profile(profile_name text, profile_pin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if profile_name is null or char_length(trim(profile_name)) not between 1 and 24 then
    raise exception '프로필 이름은 1~24자로 입력하세요.';
  end if;
  if profile_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN은 숫자 4자리여야 합니다.';
  end if;
  if (select count(*) from public.lozix_profiles) >= 10 then
    raise exception '프로필은 최대 10개까지 만들 수 있습니다.';
  end if;
  insert into public.lozix_profiles (name, pin_hash)
  values (trim(profile_name), md5('lozix-pin-v1:' || profile_pin))
  returning id into new_id;
  insert into public.lozix_profile_data (profile_id) values (new_id);
  return new_id;
end;
$$;

create or replace function public.login_lozix_profile(profile_name text, profile_pin text)
returns uuid language plpgsql security definer set search_path = public as $$
declare profile_id uuid;
begin
  select id into profile_id from public.lozix_profiles
  where name = trim(profile_name) and (pin_hash = md5('lozix-pin-v1:' || profile_pin) or pin_hash = extensions.crypt(profile_pin, pin_hash));
  if profile_id is null then raise exception '이름 또는 PIN이 맞지 않습니다.'; end if;
  return profile_id;
end;
$$;

create or replace function public.load_lozix_data(profile_id uuid, profile_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.lozix_assert_pin(profile_id, profile_pin);
  select jsonb_build_object('records', records, 'goals', goals) into result
  from public.lozix_profile_data where lozix_profile_data.profile_id = load_lozix_data.profile_id;
  return coalesce(result, '{"records":[],"goals":[]}'::jsonb);
end;
$$;

create or replace function public.save_lozix_data(profile_id uuid, profile_pin text, next_records jsonb, next_goals jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.lozix_assert_pin(profile_id, profile_pin);
  update public.lozix_profile_data
  set records = coalesce(next_records, '[]'::jsonb), goals = coalesce(next_goals, '[]'::jsonb), updated_at = now()
  where lozix_profile_data.profile_id = save_lozix_data.profile_id;
end;
$$;

grant execute on function public.list_lozix_profiles() to anon, authenticated;
grant execute on function public.create_lozix_profile(text, text) to anon, authenticated;
grant execute on function public.login_lozix_profile(text, text) to anon, authenticated;
grant execute on function public.load_lozix_data(uuid, text) to anon, authenticated;
grant execute on function public.save_lozix_data(uuid, text, jsonb, jsonb) to anon, authenticated;

-- PostgREST가 새로 만든 RPC 함수를 즉시 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';
