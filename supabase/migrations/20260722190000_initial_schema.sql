-- Consultorio Adri Caro - esquema inicial
-- Ejecutar una sola vez desde Supabase SQL Editor o mediante Supabase CLI.

begin;

create type public.app_role as enum (
  'pending',
  'professional',
  'secretary',
  'administrator'
);

create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'attended',
  'cancelled',
  'absent'
);

create type public.clinical_entry_status as enum (
  'draft',
  'finalized'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'pending',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 100),
  last_name text not null check (char_length(trim(last_name)) between 1 and 100),
  dni text not null unique check (char_length(trim(dni)) between 6 and 20),
  birth_date date not null check (birth_date <= current_date),
  phone text,
  email text,
  address text,
  emergency_contact text,
  allergies text,
  current_medication text,
  general_history text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  professional_id uuid references public.profiles (id) on delete restrict,
  starts_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 10 and 240),
  consultation_type text not null check (char_length(trim(consultation_type)) between 1 and 100),
  status public.appointment_status not null default 'pending',
  reason text,
  administrative_notes text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gynecological_histories (
  patient_id uuid primary key references public.patients (id) on delete restrict,
  last_menstrual_period date,
  menarche_age smallint check (menarche_age between 5 and 25),
  cycle_description text,
  contraception text,
  pregnancies smallint check (pregnancies >= 0),
  births smallint check (births >= 0),
  cesareans smallint check (cesareans >= 0),
  pregnancy_losses smallint check (pregnancy_losses >= 0),
  menopause_notes text,
  gynecological_history text,
  previous_surgeries text,
  family_history text,
  hpv_vaccination text,
  last_pap_date date,
  last_hpv_test_date date,
  last_colposcopy_date date,
  last_mammogram_date date,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinical_entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete restrict,
  professional_id uuid not null references public.profiles (id) on delete restrict default auth.uid(),
  appointment_id uuid references public.appointments (id) on delete set null,
  consultation_date timestamptz not null default now(),
  status public.clinical_entry_status not null default 'draft',
  reason text,
  symptoms_and_evolution text,
  physical_exam text,
  diagnosis_impression text,
  treatment_indications text,
  requested_studies text,
  follow_up text,
  private_notes text,
  version integer not null default 1 check (version > 0),
  supersedes_id uuid references public.clinical_entries (id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'draft' and finalized_at is null)
    or (status = 'finalized' and finalized_at is not null)
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index patients_name_idx on public.patients (last_name, first_name);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_patient_idx on public.appointments (patient_id);
create index clinical_entries_patient_date_idx
  on public.clinical_entries (patient_id, consultation_date desc);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);

create unique index appointments_professional_start_unique
  on public.appointments (professional_id, starts_at)
  where status not in ('cancelled', 'absent');

-- Perfil automático. Toda cuenta nueva queda pendiente hasta ser aprobada.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute procedure public.set_updated_at();

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute procedure public.set_updated_at();

create trigger gynecological_histories_set_updated_at
  before update on public.gynecological_histories
  for each row execute procedure public.set_updated_at();

create function public.protect_clinical_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las entradas clínicas no pueden eliminarse';
  end if;

  if old.status = 'finalized' then
    raise exception 'Una entrada clínica finalizada no puede modificarse';
  end if;

  if new.status = 'finalized' and old.status = 'draft' then
    new.finalized_at = now();
  end if;

  new.updated_at = now();
  return new;
end;
$$;

create trigger clinical_entries_protect_update
  before update on public.clinical_entries
  for each row execute procedure public.protect_clinical_entry();

create trigger clinical_entries_protect_delete
  before delete on public.clinical_entries
  for each row execute procedure public.protect_clinical_entry();

create function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_record_id uuid;
begin
  target_record_id := coalesce(
    nullif(to_jsonb(new) ->> 'id', '')::uuid,
    nullif(to_jsonb(old) ->> 'id', '')::uuid,
    nullif(to_jsonb(new) ->> 'patient_id', '')::uuid,
    nullif(to_jsonb(old) ->> 'patient_id', '')::uuid
  );

  insert into public.audit_logs (
    actor_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) values (
    auth.uid(),
    tg_op,
    tg_table_name,
    target_record_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger patients_audit
  after insert or update or delete on public.patients
  for each row execute procedure public.write_audit_log();

create trigger appointments_audit
  after insert or update or delete on public.appointments
  for each row execute procedure public.write_audit_log();

create trigger gynecological_histories_audit
  after insert or update or delete on public.gynecological_histories
  for each row execute procedure public.write_audit_log();

create trigger clinical_entries_audit
  after insert or update or delete on public.clinical_entries
  for each row execute procedure public.write_audit_log();

-- Helpers de autorización. Al ser security definer no generan recursión RLS.
create function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role::text
  from public.profiles
  where id = auth.uid() and active = true
$$;

create function public.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active = true
      and role in ('professional', 'secretary', 'administrator')
  )
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_active_staff() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_active_staff() to authenticated;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.gynecological_histories enable row level security;
alter table public.clinical_entries enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_admin_read
  on public.profiles for select
  to authenticated
  using (public.current_user_role() = 'administrator');

create policy profiles_admin_update
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'administrator')
  with check (public.current_user_role() = 'administrator');

create policy patients_staff_read
  on public.patients for select
  to authenticated
  using (public.is_active_staff());

create policy patients_staff_insert
  on public.patients for insert
  to authenticated
  with check (public.is_active_staff());

create policy patients_staff_update
  on public.patients for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy appointments_staff_read
  on public.appointments for select
  to authenticated
  using (public.is_active_staff());

create policy appointments_staff_insert
  on public.appointments for insert
  to authenticated
  with check (public.is_active_staff());

create policy appointments_staff_update
  on public.appointments for update
  to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

create policy gynecological_histories_clinical_read
  on public.gynecological_histories for select
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'));

create policy gynecological_histories_clinical_insert
  on public.gynecological_histories for insert
  to authenticated
  with check (public.current_user_role() in ('professional', 'administrator'));

create policy gynecological_histories_clinical_update
  on public.gynecological_histories for update
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'))
  with check (public.current_user_role() in ('professional', 'administrator'));

create policy clinical_entries_clinical_read
  on public.clinical_entries for select
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'));

create policy clinical_entries_clinical_insert
  on public.clinical_entries for insert
  to authenticated
  with check (
    public.current_user_role() in ('professional', 'administrator')
    and (professional_id = auth.uid() or public.current_user_role() = 'administrator')
  );

create policy clinical_entries_draft_update
  on public.clinical_entries for update
  to authenticated
  using (
    status = 'draft'
    and public.current_user_role() in ('professional', 'administrator')
  )
  with check (
    public.current_user_role() in ('professional', 'administrator')
    and (professional_id = auth.uid() or public.current_user_role() = 'administrator')
  );

create policy audit_logs_clinical_read
  on public.audit_logs for select
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'));

revoke all on table public.profiles from anon;
revoke all on table public.patients from anon;
revoke all on table public.appointments from anon;
revoke all on table public.gynecological_histories from anon;
revoke all on table public.clinical_entries from anon;
revoke all on table public.audit_logs from anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.patients to authenticated;
grant select, insert, update on table public.appointments to authenticated;
grant select, insert, update on table public.gynecological_histories to authenticated;
grant select, insert, update on table public.clinical_entries to authenticated;
grant select on table public.audit_logs to authenticated;

comment on table public.clinical_entries is
  'Entradas cronológicas de historia clínica. Los registros finalizados son inmutables.';

comment on column public.appointments.administrative_notes is
  'Notas administrativas visibles para secretaría. No guardar información clínica.';

commit;
