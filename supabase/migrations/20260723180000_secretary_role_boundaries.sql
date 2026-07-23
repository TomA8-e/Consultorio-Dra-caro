-- Estados administrativos usados por recepción.
alter type public.appointment_status add value if not exists 'present' after 'confirmed';
alter type public.appointment_status add value if not exists 'waiting' after 'present';

begin;

-- Los antecedentes médicos dejan de convivir con el padrón administrativo.
create table if not exists public.patient_clinical_backgrounds (
  patient_id uuid primary key references public.patients (id) on delete restrict,
  allergies text,
  current_medication text,
  general_history text,
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.patient_clinical_backgrounds (
  patient_id,
  allergies,
  current_medication,
  general_history
)
select id, allergies, current_medication, general_history
from public.patients
where allergies is not null
   or current_medication is not null
   or general_history is not null
on conflict (patient_id) do update
set allergies = excluded.allergies,
    current_medication = excluded.current_medication,
    general_history = excluded.general_history;

alter table public.patients
  drop column if exists allergies,
  drop column if exists current_medication,
  drop column if exists general_history;

alter table public.patient_clinical_backgrounds enable row level security;

drop policy if exists patient_clinical_backgrounds_clinical_read
  on public.patient_clinical_backgrounds;
create policy patient_clinical_backgrounds_clinical_read
  on public.patient_clinical_backgrounds for select
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'));

drop policy if exists patient_clinical_backgrounds_clinical_insert
  on public.patient_clinical_backgrounds;
create policy patient_clinical_backgrounds_clinical_insert
  on public.patient_clinical_backgrounds for insert
  to authenticated
  with check (public.current_user_role() in ('professional', 'administrator'));

drop policy if exists patient_clinical_backgrounds_clinical_update
  on public.patient_clinical_backgrounds;
create policy patient_clinical_backgrounds_clinical_update
  on public.patient_clinical_backgrounds for update
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'))
  with check (public.current_user_role() in ('professional', 'administrator'));

grant select, insert, update on table public.patient_clinical_backgrounds to authenticated;

drop trigger if exists patient_clinical_backgrounds_set_updated_at
  on public.patient_clinical_backgrounds;
create trigger patient_clinical_backgrounds_set_updated_at
  before update on public.patient_clinical_backgrounds
  for each row execute procedure public.set_updated_at();

drop trigger if exists patient_clinical_backgrounds_audit
  on public.patient_clinical_backgrounds;
create trigger patient_clinical_backgrounds_audit
  after insert or update or delete on public.patient_clinical_backgrounds
  for each row execute procedure public.write_audit_log();

-- El motivo clínico pertenece a la consulta; la agenda conserva sólo notas
-- administrativas visibles para recepción.
update public.appointments
set administrative_notes = reason
where administrative_notes is null and reason is not null;

alter table public.appointments
  drop column if exists reason,
  add column if not exists is_walk_in boolean not null default false;

-- Secretaría sólo puede corregir datos de contacto de pacientes existentes.
create or replace function public.enforce_secretary_patient_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_user_role() = 'secretary'
     and (
       new.first_name is distinct from old.first_name
       or new.last_name is distinct from old.last_name
       or new.dni is distinct from old.dni
       or new.birth_date is distinct from old.birth_date
     )
  then
    raise exception 'Secretaría sólo puede modificar datos de contacto.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists patients_enforce_secretary_update on public.patients;
create trigger patients_enforce_secretary_update
  before update on public.patients
  for each row execute procedure public.enforce_secretary_patient_update();

-- El estado "atendido" queda reservado a profesionales y administradores.
create or replace function public.enforce_secretary_appointment_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_user_role() = 'secretary' and new.status = 'attended' then
    raise exception 'Secretaría no puede marcar un turno como atendido.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_enforce_secretary_changes
  on public.appointments;
create trigger appointments_enforce_secretary_changes
  before insert or update on public.appointments
  for each row execute procedure public.enforce_secretary_appointment_changes();

-- Secretaría cancela turnos; la eliminación física queda reservada.
drop policy if exists appointments_staff_delete on public.appointments;
drop policy if exists appointments_clinical_admin_delete on public.appointments;
create policy appointments_clinical_admin_delete
  on public.appointments for delete
  to authenticated
  using (public.current_user_role() in ('professional', 'administrator'));

commit;
