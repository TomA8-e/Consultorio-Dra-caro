import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDuplicateDni,
  normalizeDni,
  patientSaveErrorMessage,
  validatePatientDraft,
} from "../lib/patient-validation.ts";

const validPatient = {
  firstName: "  Ana   María ",
  lastName: " Pérez ",
  dni: "12.345.678",
  birthDate: "1990-05-10",
  phone: " 11  5555-5555 ",
};

test("normaliza nombres, DNI y teléfono antes de guardar", () => {
  const result = validatePatientDraft(validPatient, "2026-08-06");
  assert.deepEqual(result, {
    ok: true,
    values: {
      first_name: "Ana María",
      last_name: "Pérez",
      dni: "12345678",
      birth_date: "1990-05-10",
      phone: "11 5555-5555",
    },
  });
});

test("rechaza nombres vacíos después de quitar espacios", () => {
  const result = validatePatientDraft({ ...validPatient, firstName: "   " }, "2026-08-06");
  assert.deepEqual(result, { ok: false, message: "Ingresá el nombre de la paciente." });
});

test("rechaza DNI cortos o con letras", () => {
  assert.equal(validatePatientDraft({ ...validPatient, dni: "12345" }, "2026-08-06").ok, false);
  assert.equal(validatePatientDraft({ ...validPatient, dni: "12A45678" }, "2026-08-06").ok, false);
});

test("rechaza fechas inexistentes y futuras", () => {
  assert.equal(validatePatientDraft({ ...validPatient, birthDate: "2026-02-31" }, "2026-08-06").ok, false);
  assert.equal(validatePatientDraft({ ...validPatient, birthDate: "2026-08-07" }, "2026-08-06").ok, false);
});

test("detecta el mismo DNI aunque tenga otro formato", () => {
  const patients = [{ id: "one", dni: "12.345.678" }];
  assert.equal(hasDuplicateDni(patients, "12345678"), true);
  assert.equal(hasDuplicateDni(patients, "12345678", "one"), false);
  assert.equal(normalizeDni(" 12-345-678 "), "12345678");
});

test("traduce errores frecuentes de Supabase", () => {
  assert.equal(patientSaveErrorMessage({ code: "23505" }), "Ya existe una paciente registrada con ese DNI.");
  assert.match(patientSaveErrorMessage({ code: "42501" }), /sesión venció/);
  assert.match(patientSaveErrorMessage({ message: "Failed to fetch" }), /Internet/);
  assert.match(patientSaveErrorMessage({ code: "23514" }), /datos no es válido/);
});
