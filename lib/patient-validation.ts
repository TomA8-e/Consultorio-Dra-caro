export type PatientDraft = {
  firstName: string;
  lastName: string;
  dni: string;
  birthDate: string;
  phone: string;
};

export type PatientValues = {
  first_name: string;
  last_name: string;
  dni: string;
  birth_date: string;
  phone: string | null;
};

type PatientSaveError = {
  code?: string;
  message?: string;
  status?: number;
} | null | undefined;

function compactSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeDni(value: string) {
  return value.trim().replace(/[.\s-]/g, "");
}

export function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validatePatientDraft(
  draft: PatientDraft,
  today = localDateInputValue(),
): { ok: true; values: PatientValues } | { ok: false; message: string } {
  const firstName = compactSpaces(draft.firstName);
  const lastName = compactSpaces(draft.lastName);
  const dni = normalizeDni(draft.dni);
  const birthDate = draft.birthDate.trim();
  const phone = compactSpaces(draft.phone);

  if (!firstName) return { ok: false, message: "Ingresá el nombre de la paciente." };
  if (!lastName) return { ok: false, message: "Ingresá el apellido de la paciente." };
  if (firstName.length > 100 || lastName.length > 100) {
    return { ok: false, message: "El nombre y el apellido no pueden superar los 100 caracteres." };
  }
  if (!dni || !/^\d+$/.test(dni)) {
    return { ok: false, message: "El DNI sólo puede contener números, puntos, espacios o guiones." };
  }
  if (dni.length < 6 || dni.length > 20) {
    return { ok: false, message: "El DNI debe tener entre 6 y 20 dígitos." };
  }
  if (!isValidDateInput(birthDate)) {
    return { ok: false, message: "Ingresá una fecha de nacimiento válida." };
  }
  if (birthDate > today) {
    return { ok: false, message: "La fecha de nacimiento no puede ser futura." };
  }
  if (phone.length > 50) {
    return { ok: false, message: "El teléfono no puede superar los 50 caracteres." };
  }

  return {
    ok: true,
    values: {
      first_name: firstName,
      last_name: lastName,
      dni,
      birth_date: birthDate,
      phone: phone || null,
    },
  };
}

export function hasDuplicateDni(
  patients: Array<{ id: string; dni: string }>,
  dni: string,
  excludedPatientId?: string,
) {
  const normalizedDni = normalizeDni(dni);
  return patients.some((patient) =>
    patient.id !== excludedPatientId && normalizeDni(patient.dni) === normalizedDni,
  );
}

export function patientSaveErrorMessage(error: PatientSaveError) {
  const code = error?.code || "";
  const message = error?.message?.toLowerCase() || "";

  if (code === "23505") return "Ya existe una paciente registrada con ese DNI.";
  if (code === "23514" || code === "22007" || code === "22008") {
    return "Alguno de los datos no es válido. Revisá el DNI y la fecha de nacimiento.";
  }
  if (code === "42501" || code === "PGRST301" || error?.status === 401 || error?.status === 403) {
    return "Tu sesión venció o no tiene permiso para guardar pacientes. Volvé a ingresar.";
  }
  if (message.includes("fetch") || message.includes("network") || message.includes("conexión")) {
    return "No pudimos conectarnos con el sistema. Verificá Internet y volvé a intentar.";
  }

  return "No pudimos guardar los cambios. Revisá los datos e intentá nuevamente.";
}
