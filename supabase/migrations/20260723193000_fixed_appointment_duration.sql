-- Los turnos del consultorio trabajan con bloques fijos de 15 minutos.
alter table public.appointments
  alter column duration_minutes set default 15;

update public.appointments
set duration_minutes = 15
where duration_minutes <> 15;
