import assert from "node:assert/strict";
import test from "node:test";
import { hasAppointmentOverlap } from "../lib/appointments.ts";

const appointments = [
  { starts_at: "2026-08-17T15:00:00-03:00", duration_minutes: 15 },
];

test("detecta un horario que se superpone", () => {
  assert.equal(
    hasAppointmentOverlap(new Date("2026-08-17T15:05:00-03:00"), 15, appointments),
    true,
  );
});

test("permite el intervalo siguiente cuando el anterior terminó", () => {
  assert.equal(
    hasAppointmentOverlap(new Date("2026-08-17T15:15:00-03:00"), 15, appointments),
    false,
  );
});

test("detecta un turno que empieza antes y ocupa el horario existente", () => {
  assert.equal(
    hasAppointmentOverlap(new Date("2026-08-17T14:50:00-03:00"), 15, appointments),
    true,
  );
});
