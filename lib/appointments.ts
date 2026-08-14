export type AppointmentInterval = {
  starts_at: string;
  duration_minutes: number;
};

export function hasAppointmentOverlap(
  startsAt: Date,
  durationMinutes: number,
  appointments: AppointmentInterval[],
) {
  const requestedStart = startsAt.getTime();
  const requestedEnd = requestedStart + durationMinutes * 60_000;

  return appointments.some((appointment) => {
    const existingStart = new Date(appointment.starts_at).getTime();
    const existingEnd = existingStart + appointment.duration_minutes * 60_000;
    return existingStart < requestedEnd && existingEnd > requestedStart;
  });
}
