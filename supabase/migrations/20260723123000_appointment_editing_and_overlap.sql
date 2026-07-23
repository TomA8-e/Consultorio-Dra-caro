begin;

-- El consultorio trabaja con una agenda única: dos turnos activos no pueden
-- ocupar el mismo intervalo, aunque hayan sido cargados por usuarios distintos.
create or replace function public.prevent_appointment_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'absent') then
    return new;
  end if;

  if exists (
    select 1
    from public.appointments as existing
    where existing.id <> new.id
      and existing.status not in ('cancelled', 'absent')
      and tstzrange(
        existing.starts_at,
        existing.starts_at + make_interval(mins => existing.duration_minutes),
        '[)'
      ) && tstzrange(
        new.starts_at,
        new.starts_at + make_interval(mins => new.duration_minutes),
        '[)'
      )
  ) then
    raise exception 'El horario se superpone con otro turno.'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_prevent_overlap on public.appointments;
create trigger appointments_prevent_overlap
  before insert or update of starts_at, duration_minutes, status
  on public.appointments
  for each row execute procedure public.prevent_appointment_overlap();

drop policy if exists appointments_staff_delete on public.appointments;
create policy appointments_staff_delete
  on public.appointments for delete
  to authenticated
  using (public.is_active_staff());

grant delete on table public.appointments to authenticated;

commit;
