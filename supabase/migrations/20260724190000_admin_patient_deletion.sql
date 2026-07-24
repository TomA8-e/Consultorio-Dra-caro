begin;

create or replace function public.delete_patient_as_administrator(patient_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_user_role() <> 'administrator' then
    raise exception 'administrator_role_required'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.clinical_entries
    where patient_id = patient_uuid
  ) or exists (
    select 1
    from public.gynecological_histories
    where patient_id = patient_uuid
  ) or exists (
    select 1
    from public.patient_clinical_backgrounds
    where patient_id = patient_uuid
  ) then
    raise exception 'patient_has_clinical_history'
      using errcode = 'P0001';
  end if;

  delete from public.appointments
  where patient_id = patient_uuid;

  delete from public.patients
  where id = patient_uuid;

  if not found then
    raise exception 'patient_not_found'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_patient_as_administrator(uuid) from public;
grant execute on function public.delete_patient_as_administrator(uuid) to authenticated;

comment on function public.delete_patient_as_administrator(uuid) is
  'Elimina una paciente sin información clínica y sus turnos. Uso exclusivo de Administración.';

commit;
