"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { hasAppointmentOverlap } from "@/lib/appointments";
import {
  hasDuplicateDni,
  localDateInputValue,
  patientSaveErrorMessage,
  validatePatientDraft,
} from "@/lib/patient-validation";
import {
  buildWhatsAppConfirmationUrl,
  formatWhatsAppAppointmentDate,
  normalizeWhatsAppPhone,
} from "@/lib/whatsapp";

type Section = "inicio" | "agenda" | "pacientes" | "historia" | "usuarios";
type AppointmentStatus = "Confirmado" | "Pendiente" | "Presente" | "En espera" | "Atendido" | "Cancelado" | "Ausente";
type ThemePreference = "light" | "dark" | "system";

type WhatsAppBookingResult = {
  patientName: string;
  phone: string;
  date: string;
  time: string;
  confirmationUrl: string;
};

type Appointment = {
  id: string;
  patientId: string;
  professionalId: string | null;
  startsAt: string;
  time: string;
  patient: string;
  type: string;
  administrativeNotes: string;
  isWalkIn: boolean;
  status: AppointmentStatus;
};

type AppointmentRow = {
  id: string;
  patient_id: string;
  professional_id: string | null;
  starts_at: string;
  duration_minutes: number;
  consultation_type: string;
  administrative_notes: string | null;
  is_walk_in: boolean;
  status: "pending" | "confirmed" | "present" | "waiting" | "attended" | "cancelled" | "absent";
  patients?: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  initials: string;
  name: string;
  dni: string;
  age: number;
  phone: string;
  lastVisit: string;
  nextVisit: string;
};

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  dni: string;
  birth_date: string;
  phone: string | null;
};

type StaffRole = "pending" | "professional" | "secretary" | "administrator";

type StaffMember = {
  id: string;
  email: string;
  full_name: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  is_current_user: boolean;
};

type ClinicalEntry = {
  id: string;
  consultation_date: string;
  status: "draft" | "finalized";
  reason: string | null;
  symptoms_and_evolution: string | null;
  physical_exam: string | null;
  diagnosis_impression: string | null;
  treatment_indications: string | null;
  requested_studies: string | null;
  follow_up: string | null;
};

type GynecologicalHistory = {
  patient_id: string;
  last_menstrual_period: string | null;
  menarche_age: number | null;
  cycle_description: string | null;
  contraception: string | null;
  pregnancies: number | null;
  births: number | null;
  cesareans: number | null;
  pregnancy_losses: number | null;
  menopause_notes: string | null;
  gynecological_history: string | null;
  previous_surgeries: string | null;
  family_history: string | null;
  hpv_vaccination: string | null;
  last_pap_date: string | null;
  last_hpv_test_date: string | null;
  last_colposcopy_date: string | null;
  last_mammogram_date: string | null;
};

function calculateAge(birthDate: string) {
  const today = new Date();
  const birth = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

function mapPatient(row: PatientRow): Patient {
  const name = `${row.first_name} ${row.last_name}`.trim();
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    initials: `${row.first_name[0] || ""}${row.last_name[0] || ""}`.toUpperCase(),
    name,
    dni: row.dni,
    age: calculateAge(row.birth_date),
    phone: row.phone || "Sin registrar",
    lastVisit: "Sin consultas",
    nextVisit: "Sin turno",
  };
}

const appointmentStatusLabels: Record<AppointmentRow["status"], AppointmentStatus> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  present: "Presente",
  waiting: "En espera",
  attended: "Atendido",
  cancelled: "Cancelado",
  absent: "Ausente",
};

const appointmentStatusValues: Record<AppointmentStatus, AppointmentRow["status"]> = {
  Pendiente: "pending",
  Confirmado: "confirmed",
  Presente: "present",
  "En espera": "waiting",
  Atendido: "attended",
  Cancelado: "cancelled",
  Ausente: "absent",
};

function mapAppointment(row: AppointmentRow): Appointment {
  const relatedPatient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  const startsAt = new Date(row.starts_at);
  return {
    id: row.id,
    patientId: row.patient_id,
    professionalId: row.professional_id,
    startsAt: row.starts_at,
    time: startsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    patient: relatedPatient ? `${relatedPatient.first_name} ${relatedPatient.last_name}` : "Paciente",
    type: row.consultation_type,
    administrativeNotes: row.administrative_notes || "",
    isWalkIn: row.is_walk_in,
    status: appointmentStatusLabels[row.status],
  };
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return dateInputValue(new Date());
}

function dateRange(value: string) {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

const navItems: { id: Section; label: string; icon: string }[] = [
  { id: "inicio", label: "Inicio", icon: "⌂" },
  { id: "agenda", label: "Agenda", icon: "□" },
  { id: "pacientes", label: "Pacientes", icon: "◎" },
  { id: "historia", label: "Historia clínica", icon: "＋" },
];

const administratorNavItem: { id: Section; label: string; icon: string } = {
  id: "usuarios",
  label: "Usuarios",
  icon: "♙",
};

const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Claro", icon: "☀" },
  { value: "dark", label: "Oscuro", icon: "☾" },
  { value: "system", label: "Sistema", icon: "◐" },
];

function applyThemePreference(preference: ThemePreference) {
  const resolvedTheme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolvedTheme;
}

function ThemeSwitcher() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [open, setOpen] = useState(false);
  const selectedTheme = themeOptions.find((option) => option.value === preference) || themeOptions[2];

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("consultorio-theme");
    const initialPreference = themeOptions.some((option) => option.value === storedTheme)
      ? storedTheme as ThemePreference
      : "system";
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      const currentPreference = window.localStorage.getItem("consultorio-theme");
      if (!currentPreference || currentPreference === "system") {
        applyThemePreference("system");
      }
    };

    const preferenceUpdate = window.setTimeout(() => setPreference(initialPreference), 0);
    applyThemePreference(initialPreference);
    mediaQuery.addEventListener("change", handleSystemChange);

    return () => {
      window.clearTimeout(preferenceUpdate);
      mediaQuery.removeEventListener("change", handleSystemChange);
    };
  }, []);

  function selectTheme(nextPreference: ThemePreference) {
    window.localStorage.setItem("consultorio-theme", nextPreference);
    setPreference(nextPreference);
    applyThemePreference(nextPreference);
    setOpen(false);
  }

  return (
    <div className="theme-switcher" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }}>
      <button
        type="button"
        className="theme-trigger"
        aria-label={`Apariencia: ${selectedTheme.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{selectedTheme.icon}</span>
        <span className="theme-trigger-label">Apariencia</span>
        <b aria-hidden="true">⌄</b>
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Cambiar apariencia">
          <span className="theme-menu-title">Apariencia</span>
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={preference === option.value ? "theme-option active" : "theme-option"}
              role="menuitemradio"
              aria-checked={preference === option.value}
              onClick={() => selectTheme(option.value)}
            >
              <span aria-hidden="true">{option.icon}</span>
              <span>{option.label}</span>
              <b aria-hidden="true">{preference === option.value ? "✓" : ""}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardClient({
  profileName,
  profileRole,
  roleLabel,
}: {
  profileName: string;
  profileRole: string;
  roleLabel: string;
}) {
  const [section, setSection] = useState<Section>("inicio");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"patient" | "appointment" | "whatsapp" | null>(null);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState("");
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientDeleting, setPatientDeleting] = useState(false);
  const [patientDeleteError, setPatientDeleteError] = useState("");
  const [patientFormError, setPatientFormError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentSaving, setAppointmentSaving] = useState(false);
  const [appointmentFormError, setAppointmentFormError] = useState("");
  const [appointmentStatusUpdating, setAppointmentStatusUpdating] = useState<string | null>(null);
  const [appointmentDeleting, setAppointmentDeleting] = useState(false);
  const [appointmentWalkIn, setAppointmentWalkIn] = useState(false);
  const [whatsAppSaving, setWhatsAppSaving] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState("");
  const [whatsAppResult, setWhatsAppResult] = useState<WhatsAppBookingResult | null>(null);
  const [agendaDate, setAgendaDate] = useState(todayInputValue);
  const isSecretary = profileRole === "secretary";
  const isAdministrator = profileRole === "administrator";
  const accessibleNavItems = isSecretary
    ? navItems.filter((item) => item.id === "inicio" || item.id === "agenda" || item.id === "pacientes")
    : isAdministrator
      ? [...navItems, administratorNavItem]
      : navItems;

  useEffect(() => {
    let mounted = true;
    let requestInFlight = false;
    const supabase = createClient();

    async function loadPatients(showError: boolean) {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        const { data, error } = await supabase
          .from("patients")
          .select("id, first_name, last_name, dni, birth_date, phone")
          .order("last_name", { ascending: true });

        if (!mounted) return;

        if (error) {
          if (showError) {
            setPatientsError("No pudimos cargar las pacientes. Volvé a intentar en unos segundos.");
          }
        } else {
          setPatients((data || []).map((row) => mapPatient(row as PatientRow)));
          setPatientsError("");
        }
      } catch {
        if (mounted && showError) {
          setPatientsError("No pudimos conectarnos para cargar las pacientes.");
        }
      } finally {
        requestInFlight = false;
        if (mounted) setPatientsLoading(false);
      }
    }

    const refreshPatients = () => { void loadPatients(false); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshPatients();
    };

    void loadPatients(true);
    const refreshInterval = window.setInterval(refreshPatients, 30_000);
    window.addEventListener("focus", refreshPatients);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshPatients);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadAppointments() {
      setAppointmentsLoading(true);
      setAppointmentsError("");
      const supabase = createClient();
      const range = dateRange(agendaDate);
      const { data, error } = await supabase
        .from("appointments")
        .select("id, patient_id, professional_id, starts_at, duration_minutes, consultation_type, administrative_notes, is_walk_in, status, patients!appointments_patient_id_fkey(first_name, last_name)")
        .gte("starts_at", range.start)
        .lt("starts_at", range.end)
        .order("starts_at", { ascending: true });

      if (!mounted) return;

      if (error) {
        setAppointmentsError("No pudimos cargar la agenda del día.");
      } else {
        setAppointments((data || []).map((row) => mapAppointment(row as unknown as AppointmentRow)));
      }
      setAppointmentsLoading(false);
    }

    loadAppointments();
    return () => { mounted = false; };
  }, [agendaDate]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const filteredPatients = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((patient) =>
      `${patient.name} ${patient.dni}`.toLowerCase().includes(term),
    );
  }, [patients, search]);

  function navigateTo(nextSection: Section) {
    const allowedSection = isSecretary && nextSection === "historia"
      ? "inicio"
      : nextSection;
    setSection(allowedSection);
    if (allowedSection === "inicio") setAgendaDate(todayInputValue());
  }

  function openNewPatient() {
    setEditingPatient(null);
    setPatientFormError("");
    setModal("patient");
  }

  function openEditPatient(patient: Patient) {
    setEditingPatient(patient);
    setSelectedPatient(null);
    setPatientFormError("");
    setModal("patient");
  }

  function openNewAppointment() {
    setEditingAppointment(null);
    setAppointmentWalkIn(false);
    setAppointmentFormError("");
    setModal("appointment");
  }

  function openWalkInAppointment() {
    setEditingAppointment(null);
    setAppointmentWalkIn(true);
    setAgendaDate(todayInputValue());
    setAppointmentFormError("");
    setModal("appointment");
  }

  function openEditAppointment(appointment: Appointment) {
    setEditingAppointment(appointment);
    setAppointmentWalkIn(appointment.isWalkIn);
    setAppointmentFormError("");
    setModal("appointment");
  }

  function openWhatsAppAppointment() {
    setWhatsAppError("");
    setWhatsAppResult(null);
    setModal("whatsapp");
  }

  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPatientFormError("");
    const data = new FormData(event.currentTarget);
    const patientDraft = {
      firstName: String(data.get("firstName") || editingPatient?.firstName || ""),
      lastName: String(data.get("lastName") || editingPatient?.lastName || ""),
      dni: String(data.get("dni") || editingPatient?.dni || ""),
      birthDate: String(data.get("birthDate") || editingPatient?.birthDate || ""),
      phone: String(data.get("phone") || ""),
    };
    const validation = validatePatientDraft(patientDraft);

    if (!validation.ok) {
      setPatientFormError(validation.message);
      return;
    }

    if (hasDuplicateDni(patients, validation.values.dni, editingPatient?.id)) {
      setPatientFormError("Ya existe una paciente registrada con ese DNI.");
      return;
    }

    setPatientSaving(true);
    const supabase = createClient();

    try {
      const saveResult = editingPatient
        ? await supabase
            .from("patients")
            .update(isSecretary ? { phone: validation.values.phone } : validation.values)
            .eq("id", editingPatient.id)
            .select("id, first_name, last_name, dni, birth_date, phone")
            .single()
        : await supabase
            .from("patients")
            .insert(validation.values)
            .select("id, first_name, last_name, dni, birth_date, phone")
            .single();
      const { data: savedPatient, error } = saveResult;

      if (error || !savedPatient) {
        console.error("patient_save_failed", { code: error?.code });
        setPatientFormError(patientSaveErrorMessage(error));
        return;
      }

      const mappedPatient = mapPatient(savedPatient as PatientRow);
      setPatients((current) => editingPatient
        ? current.map((patient) => patient.id === mappedPatient.id ? mappedPatient : patient)
        : [mappedPatient, ...current],
      );
      setAppointments((current) => current.map((appointment) =>
        appointment.patientId === mappedPatient.id
          ? { ...appointment, patient: mappedPatient.name }
          : appointment,
      ));
      setSelectedPatient((current) => current?.id === mappedPatient.id ? mappedPatient : current);
      setEditingPatient(null);
      setModal(null);
      setSection("pacientes");
    } catch (error) {
      const safeError = error instanceof Error ? { message: error.message } : null;
      console.error("patient_save_failed", { reason: "request_exception" });
      setPatientFormError(patientSaveErrorMessage(safeError));
    } finally {
      setPatientSaving(false);
    }
  }

  async function saveAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppointmentSaving(true);
    setAppointmentFormError("");

    const data = new FormData(event.currentTarget);
    const patientId = String(data.get("patientId") || "");
    const date = String(data.get("date") || "");
    const time = String(data.get("time") || "");
    const startsAt = new Date(`${date}T${time}:00`);
    const selected = patients.find((patient) => patient.id === patientId);

    if (!selected || Number.isNaN(startsAt.getTime())) {
      setAppointmentFormError("Seleccioná una paciente, una fecha y un horario válidos.");
      setAppointmentSaving(false);
      return;
    }

    const supabase = createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const professionalId = claimsData?.claims?.sub;
    const durationMinutes = 15;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    let overlapQuery = supabase
      .from("appointments")
      .select("id, starts_at, duration_minutes")
      .not("status", "in", "(cancelled,absent)")
      .gt("starts_at", new Date(startsAt.getTime() - 240 * 60_000).toISOString())
      .lt("starts_at", endsAt.toISOString());

    if (editingAppointment) {
      overlapQuery = overlapQuery.neq("id", editingAppointment.id);
    }

    const { data: possibleOverlaps, error: overlapError } = await overlapQuery;
    const hasOverlap = hasAppointmentOverlap(startsAt, durationMinutes, possibleOverlaps || []);

    if (overlapError) {
      setAppointmentFormError("No pudimos verificar la disponibilidad del horario. Intentá nuevamente.");
      setAppointmentSaving(false);
      return;
    }

    if (hasOverlap) {
      setAppointmentFormError("El horario se superpone con otro turno. Elegí una hora diferente.");
      setAppointmentSaving(false);
      return;
    }

    const values = {
      patient_id: patientId,
      professional_id: editingAppointment?.professionalId ?? (profileRole === "professional" ? professionalId : null),
      starts_at: startsAt.toISOString(),
      duration_minutes: durationMinutes,
      consultation_type: String(data.get("consultationType") || "Control ginecológico"),
      administrative_notes: String(data.get("administrativeNotes") || "").trim() || null,
      is_walk_in: appointmentWalkIn,
    };
    const query = editingAppointment
      ? supabase.from("appointments").update(values).eq("id", editingAppointment.id)
      : supabase.from("appointments").insert({ ...values, status: appointmentWalkIn ? "present" : "pending" });
    const { data: savedAppointment, error } = await query
      .select("id, patient_id, professional_id, starts_at, duration_minutes, consultation_type, administrative_notes, is_walk_in, status")
      .single();

    if (error || !savedAppointment) {
      setAppointmentFormError(
        error?.code === "23505" || error?.code === "23P01"
          ? "El horario se superpone con otro turno. Elegí una hora diferente."
          : "No pudimos guardar el turno. Revisá los datos e intentá nuevamente.",
      );
      setAppointmentSaving(false);
      return;
    }

    const mapped = mapAppointment({
      ...(savedAppointment as Omit<AppointmentRow, "patients">),
      patients: { first_name: selected.firstName, last_name: selected.lastName },
    });

    if (date === agendaDate) {
      setAppointments((current) => {
        const withoutEdited = current.filter((appointment) => appointment.id !== mapped.id);
        return [...withoutEdited, mapped].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      });
    } else if (editingAppointment) {
      setAppointments((current) => current.filter((appointment) => appointment.id !== editingAppointment.id));
    }

    setAppointmentSaving(false);
    setEditingAppointment(null);
    setAppointmentWalkIn(false);
    setModal(null);
    setSection("agenda");
    if (date !== agendaDate) setAgendaDate(date);
  }

  async function saveWhatsAppAppointment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWhatsAppError("");

    const form = new FormData(event.currentTarget);
    const selectedPatientId = String(form.get("patientId") || "");
    const existingPatient = patients.find((patient) => patient.id === selectedPatientId) || null;
    const date = String(form.get("date") || "");
    const time = String(form.get("time") || "");
    const consultationType = String(form.get("consultationType") || "Control ginecológico");
    const startsAt = new Date(`${date}T${time}:00`);

    if (!date || !time || Number.isNaN(startsAt.getTime())) {
      setWhatsAppError("Elegí una fecha y un horario válidos.");
      return;
    }
    if (startsAt.getTime() < Date.now() - 60_000) {
      setWhatsAppError("El turno no puede quedar agendado en un horario pasado.");
      return;
    }
    if (startsAt.getMinutes() % 15 !== 0) {
      setWhatsAppError("Elegí un horario en intervalos de 15 minutos.");
      return;
    }

    let patientValues: ReturnType<typeof validatePatientDraft> | null = null;
    let phone = existingPatient
      ? String(form.get("existingPhone") || (existingPatient.phone === "Sin registrar" ? "" : existingPatient.phone)).trim()
      : String(form.get("newPhone") || "").trim();

    if (!existingPatient) {
      patientValues = validatePatientDraft({
        firstName: String(form.get("newFirstName") || ""),
        lastName: String(form.get("newLastName") || ""),
        dni: String(form.get("newDni") || ""),
        birthDate: String(form.get("newBirthDate") || ""),
        phone,
      });

      if (!patientValues.ok) {
        setWhatsAppError(patientValues.message);
        return;
      }
      if (hasDuplicateDni(patients, patientValues.values.dni)) {
        setWhatsAppError("Ya existe una paciente con ese DNI. Buscala antes de continuar.");
        return;
      }
      phone = patientValues.values.phone || "";
    }

    if (!normalizeWhatsAppPhone(phone)) {
      setWhatsAppError("Ingresá un celular válido con código de área, por ejemplo 11 5555-5555.");
      return;
    }

    setWhatsAppSaving(true);
    const supabase = createClient();
    let createdPatient: Patient | null = null;

    try {
      const durationMinutes = 15;
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      const { data: possibleOverlaps, error: overlapError } = await supabase
        .from("appointments")
        .select("id, starts_at, duration_minutes")
        .not("status", "in", "(cancelled,absent)")
        .gt("starts_at", new Date(startsAt.getTime() - 240 * 60_000).toISOString())
        .lt("starts_at", endsAt.toISOString());

      if (overlapError) {
        setWhatsAppError("No pudimos comprobar si el horario está disponible. Intentá nuevamente.");
        return;
      }

      const hasOverlap = hasAppointmentOverlap(startsAt, durationMinutes, possibleOverlaps || []);

      if (hasOverlap) {
        setWhatsAppError("Ese horario ya está ocupado. Elegí otro intervalo de 15 minutos.");
        return;
      }

      const { data: claimsData } = await supabase.auth.getClaims();
      const currentUserId = claimsData?.claims?.sub;

      if (!currentUserId) {
        setWhatsAppError("La sesión venció. Volvé a ingresar antes de guardar el turno.");
        return;
      }

      let appointmentPatient = existingPatient;

      if (!appointmentPatient && patientValues?.ok) {
        const { data: savedPatient, error: patientError } = await supabase
          .from("patients")
          .insert(patientValues.values)
          .select("id, first_name, last_name, dni, birth_date, phone")
          .single();

        if (patientError || !savedPatient) {
          setWhatsAppError(patientSaveErrorMessage(patientError));
          return;
        }

        createdPatient = mapPatient(savedPatient as PatientRow);
        appointmentPatient = createdPatient;
        setPatients((current) => [createdPatient as Patient, ...current]);
      } else if (appointmentPatient && phone !== (appointmentPatient.phone === "Sin registrar" ? "" : appointmentPatient.phone)) {
        const { data: updatedPatient, error: phoneError } = await supabase
          .from("patients")
          .update({ phone })
          .eq("id", appointmentPatient.id)
          .select("id, first_name, last_name, dni, birth_date, phone")
          .single();

        if (phoneError || !updatedPatient) {
          setWhatsAppError(patientSaveErrorMessage(phoneError));
          return;
        }

        appointmentPatient = mapPatient(updatedPatient as PatientRow);
        setPatients((current) => current.map((patient) =>
          patient.id === appointmentPatient?.id ? appointmentPatient : patient,
        ));
      }

      if (!appointmentPatient) {
        setWhatsAppError("Seleccioná una paciente o completá sus datos.");
        return;
      }

      const { data: savedAppointment, error: appointmentError } = await supabase
        .from("appointments")
        .insert({
          patient_id: appointmentPatient.id,
          professional_id: profileRole === "professional" ? currentUserId : null,
          starts_at: startsAt.toISOString(),
          duration_minutes: durationMinutes,
          consultation_type: consultationType,
          administrative_notes: "Agendado por WhatsApp",
          is_walk_in: false,
          status: "confirmed",
        })
        .select("id, patient_id, professional_id, starts_at, duration_minutes, consultation_type, administrative_notes, is_walk_in, status")
        .single();

      if (appointmentError || !savedAppointment) {
        setWhatsAppError(
          appointmentError?.code === "23505" || appointmentError?.code === "23P01"
            ? "El horario acaba de ocuparse. Elegí otro para completar el turno."
            : createdPatient
              ? "La paciente quedó registrada, pero no pudimos crear el turno. Volvé a intentarlo seleccionándola en la búsqueda."
              : "No pudimos guardar el turno. Revisá los datos e intentá nuevamente.",
        );
        return;
      }

      const mappedAppointment = mapAppointment({
        ...(savedAppointment as Omit<AppointmentRow, "patients">),
        patients: {
          first_name: appointmentPatient.firstName,
          last_name: appointmentPatient.lastName,
        },
      });

      if (date === agendaDate) {
        setAppointments((current) => [...current, mappedAppointment]
          .sort((first, second) => first.startsAt.localeCompare(second.startsAt)));
      }

      const confirmation = {
        patientName: appointmentPatient.name,
        date,
        time,
      };
      setWhatsAppResult({
        ...confirmation,
        phone,
        confirmationUrl: buildWhatsAppConfirmationUrl(phone, confirmation),
      });
    } catch (error) {
      console.error("whatsapp_appointment_save_failed", {
        reason: error instanceof Error ? error.name : "request_exception",
      });
      setWhatsAppError("No pudimos conectarnos con el sistema. Verificá Internet y volvé a intentar.");
    } finally {
      setWhatsAppSaving(false);
    }
  }

  async function deleteAppointment() {
    if (!editingAppointment || isSecretary) return;
    const confirmed = window.confirm(`¿Eliminar el turno de ${editingAppointment.patient}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    setAppointmentDeleting(true);
    setAppointmentFormError("");
    const supabase = createClient();
    const { error } = await supabase.from("appointments").delete().eq("id", editingAppointment.id);

    if (error) {
      setAppointmentFormError("No pudimos eliminar el turno. Verificá los permisos e intentá nuevamente.");
      setAppointmentDeleting(false);
      return;
    }

    setAppointments((current) => current.filter((appointment) => appointment.id !== editingAppointment.id));
    setAppointmentDeleting(false);
    setEditingAppointment(null);
    setAppointmentWalkIn(false);
    setModal(null);
  }

  async function deletePatient() {
    if (!selectedPatient || !isAdministrator) return;
    const confirmed = window.confirm(
      `¿Eliminar definitivamente a ${selectedPatient.name}? También se eliminarán sus turnos. Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setPatientDeleting(true);
    setPatientDeleteError("");
    const patientId = selectedPatient.id;
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_patient_as_administrator", {
      patient_uuid: patientId,
    });

    if (error) {
      setPatientDeleteError(
        error.message.includes("patient_has_clinical_history")
          ? "No se puede eliminar una paciente que tenga información clínica registrada."
          : "No pudimos eliminar la paciente. Verificá los permisos e intentá nuevamente.",
      );
      setPatientDeleting(false);
      return;
    }

    setPatients((current) => current.filter((patient) => patient.id !== patientId));
    setAppointments((current) => current.filter((appointment) => appointment.patientId !== patientId));
    setPatientDeleting(false);
    setSelectedPatient(null);
  }

  async function changeAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
    if (isSecretary && status === "Atendido") {
      setAppointmentsError("El estado Atendido debe registrarlo el profesional.");
      return;
    }
    setAppointmentStatusUpdating(appointmentId);
    setAppointmentsError("");

    const supabase = createClient();
    const { error } = await supabase
      .from("appointments")
      .update({ status: appointmentStatusValues[status] })
      .eq("id", appointmentId);

    if (error) {
      setAppointmentsError("No pudimos actualizar el estado del turno.");
    } else {
      setAppointments((current) => current.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, status } : appointment,
      ));
    }

    setAppointmentStatusUpdating(null);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image className="brand-logo" src="/logo-consultorio-v2.png" alt="Consultorio ginecológico" width={1335} height={282} priority />
        </div>
        <nav aria-label="Navegación principal">
          {accessibleNavItems.map((item) => (
            <button key={item.id} className={section === item.id ? "nav-item active" : "nav-item"} onClick={() => navigateTo(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <button className="profile-card" onClick={handleSignOut} disabled={signingOut} title="Cerrar sesión">
          <span className="avatar avatar-dark">DA</span>
          <span><strong>{profileName}</strong><small>{signingOut ? "Cerrando sesión..." : roleLabel}</small></span>
          <b>↪</b>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => navigateTo("inicio")} aria-label="Ir al inicio">
            <Image src="/logo-simbolo-v2.png" alt="" width={460} height={360} priority />
          </button>
          <div className="top-search">
            <span>⌕</span>
            <input aria-label="Buscar pacientes" placeholder="Buscar paciente por nombre o DNI..." value={search} onChange={(e) => setSearch(e.target.value)} onFocus={() => navigateTo("pacientes")} />
          </div>
          <ThemeSwitcher />
          <button className="primary-button" onClick={openNewAppointment}><span>＋</span> Nuevo turno</button>
        </header>

        <div className="content">
          {section === "inicio" && <Dashboard profileName={profileName} isSecretary={isSecretary} patientCount={patients.length} patientsLoading={patientsLoading} patients={patients} appointments={appointments} appointmentsLoading={appointmentsLoading} updatingAppointmentId={appointmentStatusUpdating} onStatusChange={changeAppointmentStatus} onNewPatient={openNewPatient} onNewAppointment={openNewAppointment} onWhatsApp={openWhatsAppAppointment} onWalkIn={openWalkInAppointment} onAgenda={() => navigateTo("agenda")} onPatients={() => navigateTo("pacientes")} />}
          {section === "agenda" && <Agenda selectedDate={agendaDate} onDateChange={setAgendaDate} appointments={appointments} loading={appointmentsLoading} loadError={appointmentsError} updatingAppointmentId={appointmentStatusUpdating} onStatusChange={changeAppointmentStatus} onEditAppointment={openEditAppointment} onNewAppointment={openNewAppointment} onWhatsApp={openWhatsAppAppointment} onWalkIn={openWalkInAppointment} canMarkAttended={!isSecretary} />}
          {section === "pacientes" && <Patients patients={filteredPatients} loading={patientsLoading} loadError={patientsError} search={search} setSearch={setSearch} onNewPatient={openNewPatient} onSelect={setSelectedPatient} />}
          {section === "historia" && <ClinicalHistory patients={patients} onSelect={setSelectedPatient} />}
          {section === "usuarios" && isAdministrator && <UserAdministration />}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {accessibleNavItems.map((item) => (
          <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => navigateTo(item.id)}><span>{item.icon}</span>{item.label.split(" ")[0]}</button>
        ))}
      </nav>

      {modal === "patient" && <PatientModal patient={editingPatient} contactOnly={isSecretary && Boolean(editingPatient)} saving={patientSaving} error={patientFormError} onClose={() => { if (!patientSaving) { setEditingPatient(null); setModal(null); } }} onSubmit={savePatient} />}
      {modal === "appointment" && <AppointmentModal patients={patients} appointment={editingAppointment} isWalkIn={appointmentWalkIn} defaultDate={agendaDate} saving={appointmentSaving || appointmentDeleting} deleting={appointmentDeleting} canDelete={!isSecretary} error={appointmentFormError} onClose={() => { if (!appointmentSaving && !appointmentDeleting) { setEditingAppointment(null); setAppointmentWalkIn(false); setModal(null); } }} onSubmit={saveAppointment} onDelete={deleteAppointment} />}
      {modal === "whatsapp" && <WhatsAppAppointmentModal patients={patients} defaultDate={agendaDate} saving={whatsAppSaving} error={whatsAppError} result={whatsAppResult} onClose={() => { if (!whatsAppSaving) { setWhatsAppError(""); setWhatsAppResult(null); setModal(null); } }} onSubmit={saveWhatsAppAppointment} onViewAgenda={() => { const resultDate = whatsAppResult?.date; setWhatsAppResult(null); setModal(null); setSection("agenda"); if (resultDate) setAgendaDate(resultDate); }} />}
      {selectedPatient && <PatientDrawer patient={selectedPatient} profileName={profileName} profileRole={profileRole} deleting={patientDeleting} deleteError={patientDeleteError} onDelete={deletePatient} onEdit={() => openEditPatient(selectedPatient)} onClose={() => { if (!patientDeleting) { setPatientDeleteError(""); setSelectedPatient(null); } }} />}
    </main>
  );
}

function Dashboard({ profileName, isSecretary, patientCount, patientsLoading, patients, appointments, appointmentsLoading, updatingAppointmentId, onStatusChange, onNewPatient, onNewAppointment, onWhatsApp, onWalkIn, onAgenda, onPatients }: { profileName: string; isSecretary: boolean; patientCount: number; patientsLoading: boolean; patients: Patient[]; appointments: Appointment[]; appointmentsLoading: boolean; updatingAppointmentId: string | null; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void; onNewPatient: () => void; onNewAppointment: () => void; onWhatsApp: () => void; onWalkIn: () => void; onAgenda: () => void; onPatients: () => void }) {
  const [renderedAt] = useState(() => Date.now());
  const confirmedCount = appointments.filter((appointment) => appointment.status === "Confirmado").length;
  const attendedCount = appointments.filter((appointment) => appointment.status === "Atendido").length;
  const waitingCount = appointments.filter((appointment) => appointment.status === "Presente" || appointment.status === "En espera").length;
  const nextAppointment = appointments.find((appointment) => new Date(appointment.startsAt).getTime() >= renderedAt && appointment.status !== "Cancelado") || appointments[0];
  const nextPatient = patients.find((patient) => patient.id === nextAppointment?.patientId);
  const todayLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">{todayLabel.toUpperCase()}</p><h1>Buen día, {profileName}</h1><p>Este es el resumen de tu consultorio para hoy.</p></div>
    </div>
    <div className="stats-grid">
      <Stat icon="▣" value={appointmentsLoading ? "—" : String(appointments.length)} label="Turnos de hoy" detail={appointmentsLoading ? "Cargando agenda" : `${confirmedCount} confirmados`} tone="wine" />
      <Stat icon="◷" value={nextAppointment?.time || "—"} label="Próximo turno" detail={nextAppointment?.patient || "Sin turnos pendientes"} tone="rose" />
      <Stat icon="✓" value={appointmentsLoading ? "—" : String(isSecretary ? waitingCount : attendedCount)} label={isSecretary ? "En consultorio" : "Atendidas"} detail={appointmentsLoading ? "Cargando agenda" : isSecretary ? "Presentes o en espera" : `${Math.max(appointments.length - attendedCount, 0)} pendientes`} tone="green" />
      <Stat icon="◎" value={patientsLoading ? "—" : String(patientCount)} label="Pacientes" detail={patientsLoading ? "Cargando registros" : "Guardadas en Supabase"} tone="sand" />
    </div>
    <div className="dashboard-grid">
      <section className="card appointments-card">
        <div className="card-header"><div><h2>Agenda de hoy</h2><p>{todayLabel}</p></div><button className="text-button" onClick={onAgenda}>Ver agenda completa →</button></div>
        <div className="appointment-list">
          {appointments.map((appointment) => <AppointmentRow key={appointment.id} {...appointment} canMarkAttended={!isSecretary} updating={updatingAppointmentId === appointment.id} onStatusChange={onStatusChange} />)}
          {!appointmentsLoading && appointments.length === 0 && <div className="compact-empty">No hay turnos registrados para hoy.</div>}
          {appointmentsLoading && <div className="compact-empty">Cargando agenda...</div>}
        </div>
      </section>
      <aside className="right-column">
        <section className="card quick-actions"><div className="card-header"><div><h2>Acciones rápidas</h2><p>Atajos frecuentes</p></div></div>
          <button onClick={onWhatsApp}><span className="quick-icon whatsapp">◉</span><span><strong>Agendar desde WhatsApp</strong><small>Paciente y turno en un solo paso</small></span><b>›</b></button>
          <button onClick={onNewAppointment}><span className="quick-icon">＋</span><span><strong>Nuevo turno</strong><small>Agendar una consulta</small></span><b>›</b></button>
          <button onClick={onWalkIn}><span className="quick-icon green">●</span><span><strong>Paciente sin turno</strong><small>Registrar llegada espontánea</small></span><b>›</b></button>
          <button onClick={onNewPatient}><span className="quick-icon rose">◎</span><span><strong>Nueva paciente</strong><small>Registrar ficha personal</small></span><b>›</b></button>
          <button onClick={onPatients}><span className="quick-icon sand">⌕</span><span><strong>Buscar paciente</strong><small>{isSecretary ? "Consultar datos de contacto" : "Consultar historia clínica"}</small></span><b>›</b></button>
        </section>
        <section className="card next-patient"><p className="eyebrow">PRÓXIMA PACIENTE</p>{nextAppointment ? <><div className="patient-summary"><span className="avatar avatar-lg">{nextAppointment.patient.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><h3>{nextAppointment.patient}</h3><p>{nextAppointment.type}</p></div><span className="time-pill">{nextAppointment.time}</span></div><div className="patient-meta"><span><small>Edad</small><strong>{nextPatient ? `${nextPatient.age} años` : "Sin registrar"}</strong></span><span><small>{isSecretary ? "Contacto" : "Última consulta"}</small><strong>{isSecretary ? nextPatient?.phone || "Sin registrar" : nextPatient?.lastVisit || "Sin consultas"}</strong></span></div><button className="secondary-button full" onClick={onPatients}>{isSecretary ? "Abrir datos administrativos" : "Abrir ficha clínica"}</button></> : <div className="compact-empty">No hay próximos turnos para hoy.</div>}</section>
      </aside>
    </div>
  </>;
}

function Stat({ icon, value, label, detail, tone }: { icon: string; value: string; label: string; detail: string; tone: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div></article>;
}

function AppointmentStatusSelect({ appointmentId, patient, status, updating, canMarkAttended, onStatusChange }: { appointmentId: string; patient: string; status: AppointmentStatus; updating: boolean; canMarkAttended: boolean; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void }) {
  const statusValue = appointmentStatusValues[status];
  const statuses: AppointmentStatus[] = ["Pendiente", "Confirmado", "Presente", "En espera", "Atendido", "Cancelado", "Ausente"];
  return <label className={`appointment-status-control status-control-${statusValue} ${updating ? "is-updating" : ""}`}><span className="status-dot" aria-hidden="true" /><select className="appointment-status-select" aria-label={`Estado del turno de ${patient}`} value={status} disabled={updating} onChange={(event) => onStatusChange(appointmentId, event.target.value as AppointmentStatus)}>{statuses.map((option) => <option key={option} disabled={option === "Atendido" && !canMarkAttended}>{option}</option>)}</select><span className="status-chevron" aria-hidden="true">⌄</span></label>;
}

function AppointmentRow({ id, time, patient, type, status, updating, canMarkAttended, onStatusChange }: { id: string; time: string; patient: string; type: string; status: AppointmentStatus; updating: boolean; canMarkAttended: boolean; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void }) {
  return <div className="appointment-row"><strong className="appointment-time">{time}</strong><span className="avatar">{patient.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span><div className="appointment-person"><strong>{patient}</strong><small>{type}</small></div><AppointmentStatusSelect appointmentId={id} patient={patient} status={status} updating={updating} canMarkAttended={canMarkAttended} onStatusChange={onStatusChange} /></div>;
}

function Agenda({ selectedDate, onDateChange, appointments, loading, loadError, updatingAppointmentId, onStatusChange, onEditAppointment, onNewAppointment, onWhatsApp, onWalkIn, canMarkAttended }: { selectedDate: string; onDateChange: (date: string) => void; appointments: Appointment[]; loading: boolean; loadError: string; updatingAppointmentId: string | null; onStatusChange: (appointmentId: string, status: AppointmentStatus) => void; onEditAppointment: (appointment: Appointment) => void; onNewAppointment: () => void; onWhatsApp: () => void; onWalkIn: () => void; canMarkAttended: boolean }) {
  const selectedDateValue = new Date(`${selectedDate}T12:00:00`);
  const dateLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(selectedDateValue);
  const isToday = selectedDate === todayInputValue();
  const moveDate = (days: number) => {
    const nextDate = new Date(selectedDateValue);
    nextDate.setDate(nextDate.getDate() + days);
    onDateChange(dateInputValue(nextDate));
  };

  return <div className="standard-page"><div className="page-heading"><div><p className="eyebrow">ORGANIZACIÓN</p><h1>Agenda</h1><p>Gestioná las consultas y horarios del consultorio.</p></div><div className="page-heading-actions"><button className="whatsapp-button" onClick={onWhatsApp}>◉ WhatsApp</button><button className="secondary-button" onClick={onWalkIn}>● Paciente sin turno</button><button className="primary-button" onClick={onNewAppointment}>＋ Nuevo turno</button></div></div>{loadError && <div className="data-error" role="alert">{loadError}</div>}<section className="card calendar-card"><div className="calendar-toolbar"><button onClick={() => moveDate(-1)} aria-label="Ver día anterior">‹</button><div className="calendar-date-title"><h2>{dateLabel}</h2>{isToday && <span>Hoy</span>}</div><button onClick={() => moveDate(1)} aria-label="Ver día siguiente">›</button><label className="calendar-date-picker"><span>Elegir fecha</span><input type="date" value={selectedDate} onChange={(event) => onDateChange(event.target.value)} aria-label="Elegir fecha de la agenda" /></label><div className="view-switch"><button className={isToday ? "active" : ""} onClick={() => onDateChange(todayInputValue())} disabled={isToday}>Hoy</button><button className="active">Día</button><button disabled>Semana</button></div></div><div className="day-schedule">{appointments.map((a) => <div className="schedule-slot" key={a.id}><time>{a.time}</time><div className={`schedule-event event-${appointmentStatusValues[a.status]}`}><span className="event-accent" aria-hidden="true" /><strong>{a.patient}{a.isWalkIn ? " · Sin turno" : ""}</strong><span>{a.type}</span><div className="schedule-event-actions"><button type="button" onClick={() => onEditAppointment(a)} aria-label={`Editar turno de ${a.patient}`}>Editar</button><AppointmentStatusSelect appointmentId={a.id} patient={a.patient} status={a.status} updating={updatingAppointmentId === a.id} canMarkAttended={canMarkAttended} onStatusChange={onStatusChange} /></div></div></div>)}{!loading && appointments.length === 0 && <div className="agenda-empty"><span>◷</span><h3>Agenda libre</h3><p>No hay turnos registrados para esta fecha.</p><button className="secondary-button" onClick={onNewAppointment}>Crear un turno para este día</button></div>}{loading && <div className="agenda-empty"><p>Cargando agenda...</p></div>}</div></section></div>;
}

function Patients({ patients, loading, loadError, search, setSearch, onNewPatient, onSelect }: { patients: Patient[]; loading: boolean; loadError: string; search: string; setSearch: (value: string) => void; onNewPatient: () => void; onSelect: (patient: Patient) => void }) {
  return <div className="standard-page"><div className="page-heading"><div><p className="eyebrow">REGISTROS</p><h1>Pacientes</h1><p>{loading ? "Cargando fichas..." : `${patients.length} fichas registradas.`}</p></div><button className="primary-button" onClick={onNewPatient}>＋ Nueva paciente</button></div>{loadError && <div className="data-error" role="alert">{loadError}</div>}<section className="card patient-table-card"><div className="table-tools"><label><span>⌕</span><input placeholder="Buscar por nombre o DNI" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div><div className="patient-table"><div className="patient-table-head"><span>Paciente</span><span>DNI</span><span>Contacto</span><span>Última consulta</span><span>Próximo turno</span><span /></div>{patients.map((patient) => <button className="patient-row" key={patient.id} onClick={() => onSelect(patient)}><span className="patient-name"><i className="avatar">{patient.initials}</i><span><strong>{patient.name}</strong><small>{patient.age} años</small></span></span><span>{patient.dni}</span><span>{patient.phone}</span><span>{patient.lastVisit}</span><span className="next-visit">{patient.nextVisit}</span><span>›</span></button>)}{!loading && patients.length === 0 && <div className="empty-state"><span>⌕</span><h3>{search ? "No encontramos pacientes" : "Todavía no hay pacientes"}</h3><p>{search ? "Probá con otro nombre o número de DNI." : "Usá “Nueva paciente” para crear la primera ficha."}</p></div>}{loading && <div className="empty-state"><span>◷</span><h3>Cargando pacientes</h3><p>Estamos consultando la base de datos.</p></div>}</div></section></div>;
}

function ClinicalHistory({ patients, onSelect }: { patients: Patient[]; onSelect: (patient: Patient) => void }) {
  return <div className="standard-page"><div className="page-heading"><div><p className="eyebrow">INFORMACIÓN CLÍNICA</p><h1>Historia clínica</h1><p>Acceso reservado exclusivamente a profesionales autorizados.</p></div></div><div className="privacy-card"><span>◇</span><div><strong>Información especialmente protegida</strong><p>Los registros clínicos finalizados conservarán su historial. Las correcciones se agregarán como nuevas versiones.</p></div></div><section className="card history-list"><div className="card-header"><div><h2>Seleccionar paciente</h2><p>Abrí una ficha para consultar su línea de tiempo clínica.</p></div></div>{patients.slice(0, 4).map((patient) => <button key={patient.id} onClick={() => onSelect(patient)}><span className="avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>Última consulta: {patient.lastVisit}</small></span><b>Abrir historia →</b></button>)}</section></div>;
}

const staffRoleLabels: Record<StaffRole, string> = {
  pending: "Pendiente",
  professional: "Profesional",
  secretary: "Secretaría",
  administrator: "Administración",
};

function formatStaffDate(value: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registrar";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(date);
}

function UserAdministration() {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadMembers() {
    setLoading(true);
    setLoadError("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_staff_as_administrator");

    if (error) {
      setLoadError("No pudimos cargar los usuarios. Verificá que la migración de administración esté aplicada.");
    } else {
      setMembers((data || []) as StaffMember[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function loadInitialMembers() {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_staff_as_administrator");
      if (!mounted) return;

      if (error) {
        setLoadError("No pudimos cargar los usuarios. Verificá que la migración de administración esté aplicada.");
      } else {
        setMembers((data || []) as StaffMember[]);
      }
      setLoading(false);
    }

    loadInitialMembers();
    return () => { mounted = false; };
  }, []);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    if (!normalizedSearch) return members;
    return members.filter((member) =>
      `${member.full_name} ${member.email} ${staffRoleLabels[member.role]}`
        .toLocaleLowerCase("es")
        .includes(normalizedSearch),
    );
  }, [members, search]);

  const activeCount = members.filter((member) => member.active).length;
  const professionalCount = members.filter((member) => member.active && member.role === "professional").length;
  const pendingCount = members.filter((member) => member.role === "pending").length;

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const formData = new FormData(event.currentTarget);
    const fullName = String(formData.get("fullName") || "").trim();
    const role = String(formData.get("role") || editing.role) as StaffRole;
    const active = editing.is_current_user ? true : formData.get("active") === "on";

    setSaving(true);
    setFormError("");
    setSuccessMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("update_staff_as_administrator", {
      staff_uuid: editing.id,
      new_full_name: fullName,
      new_role: role,
      new_active: active,
    });

    if (error) {
      const message = error.message;
      setFormError(
        message.includes("cannot_remove_own_administrator_access")
          ? "Tu propia cuenta debe conservar el rol de administración y permanecer activa."
          : message.includes("last_administrator_required")
            ? "Debe quedar al menos una cuenta administradora activa."
            : "No pudimos guardar los cambios. Revisá los datos e intentá nuevamente.",
      );
      setSaving(false);
      return;
    }

    setMembers((current) => current.map((member) =>
      member.id === editing.id ? { ...member, full_name: fullName, role, active } : member,
    ));
    setSuccessMessage(`Se actualizó el acceso de ${fullName}.`);
    setSaving(false);
    setEditing(null);
  }

  return (
    <div className="standard-page staff-admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN</p>
          <h1>Usuarios</h1>
          <p>Gestioná nombres, roles y accesos sin salir de la vista clínica.</p>
        </div>
        <button className="secondary-button" onClick={loadMembers} disabled={loading}>
          {loading ? "Actualizando..." : "↻ Actualizar lista"}
        </button>
      </div>

      <div className="staff-stats-grid">
        <Stat icon="✓" value={loading ? "—" : String(activeCount)} label="Cuentas activas" detail={`${members.length} registradas`} tone="green" />
        <Stat icon="＋" value={loading ? "—" : String(professionalCount)} label="Profesionales" detail="Con acceso clínico" tone="wine" />
        <Stat icon="◷" value={loading ? "—" : String(pendingCount)} label="Pendientes" detail="Esperan asignación" tone="sand" />
      </div>

      <div className="staff-admin-note">
        <span>◇</span>
        <div>
          <strong>Alta y baja seguras</strong>
          <p>Las cuentas creadas o invitadas desde Supabase aparecerán como pendientes. Desde acá asignás su rol, las activás o realizás una baja lógica para conservar la trazabilidad.</p>
        </div>
      </div>

      {loadError && <div className="data-error" role="alert">{loadError}</div>}
      {successMessage && <div className="data-success" role="status">{successMessage}</div>}

      <section className="card staff-table-card">
        <div className="table-tools">
          <label>
            <span>⌕</span>
            <input
              placeholder="Buscar por nombre, correo o rol"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="staff-table-head">
          <span>Usuario</span><span>Rol</span><span>Estado</span><span>Último acceso</span><span />
        </div>
        <div className="staff-table">
          {filteredMembers.map((member) => (
            <button
              className="staff-row"
              key={member.id}
              onClick={() => { setFormError(""); setSuccessMessage(""); setEditing(member); }}
            >
              <span className="staff-identity">
                <i className="avatar">{member.full_name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "US"}</i>
                <span>
                  <strong>{member.full_name || "Sin nombre"}</strong>
                  <small>{member.email}{member.is_current_user ? " · Tu cuenta" : ""}</small>
                </span>
              </span>
              <span className={`staff-role staff-role-${member.role}`}>{staffRoleLabels[member.role]}</span>
              <span className={`staff-state ${member.active ? "is-active" : "is-inactive"}`}>
                {member.active ? "Activo" : "Inactivo"}
              </span>
              <span>{formatStaffDate(member.last_sign_in_at)}</span>
              <span>Editar ›</span>
            </button>
          ))}
          {!loading && filteredMembers.length === 0 && (
            <div className="empty-state">
              <span>⌕</span>
              <h3>No encontramos usuarios</h3>
              <p>Probá con otro nombre, correo o rol.</p>
            </div>
          )}
          {loading && (
            <div className="empty-state">
              <span>◷</span>
              <h3>Cargando usuarios</h3>
              <p>Estamos consultando las cuentas autorizadas.</p>
            </div>
          )}
        </div>
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => { if (!saving) setEditing(null); }}>
          <section className="modal staff-modal" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">ABM DE USUARIOS</p>
                <h2 id="staff-modal-title">Editar acceso</h2>
                <small className="modal-subtitle">{editing.email}</small>
              </div>
              <button onClick={() => setEditing(null)} aria-label="Cerrar" disabled={saving}>×</button>
            </div>
            <form onSubmit={saveMember}>
              <div className="form-grid">
                <label className="wide">Nombre visible<input name="fullName" required maxLength={120} defaultValue={editing.full_name} /></label>
                <label className="wide">Rol
                  <select name="role" defaultValue={editing.role} disabled={editing.is_current_user}>
                    <option value="pending">Pendiente</option>
                    <option value="secretary">Secretaría</option>
                    <option value="professional">Profesional</option>
                    <option value="administrator">Administración</option>
                  </select>
                </label>
              </div>
              <label className={`staff-active-toggle ${editing.is_current_user ? "is-locked" : ""}`}>
                <input name="active" type="checkbox" defaultChecked={editing.active} disabled={editing.is_current_user} />
                <span><strong>Cuenta activa</strong><small>Al desactivarla, la persona ya no podrá ingresar.</small></span>
              </label>
              {editing.is_current_user && <p className="form-hint">Para evitar perder el acceso, tu propia cuenta conserva el rol de administración y permanece activa.</p>}
              {formError && <div className="data-error modal-error" role="alert">{formError}</div>}
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
                <button className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function WhatsAppAppointmentModal({ patients, defaultDate, saving, error, result, onClose, onSubmit, onViewAgenda }: { patients: Patient[]; defaultDate: string; saving: boolean; error: string; result: WhatsAppBookingResult | null; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onViewAgenda: () => void }) {
  const [mode, setMode] = useState<"search" | "new">("search");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId) || null;
  const matchingPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (term.length < 2) return [];
    return patients.filter((patient) =>
      `${patient.name} ${patient.dni} ${patient.phone}`.toLowerCase().includes(term),
    ).slice(0, 6);
  }, [patientSearch, patients]);

  if (result) {
    return <div className="modal-backdrop" role="presentation"><section className="modal whatsapp-modal" role="dialog" aria-modal="true" aria-labelledby="whatsapp-success-title"><div className="modal-header"><div><p className="eyebrow">TURNO CONFIRMADO</p><h2 id="whatsapp-success-title">Listo para enviar por WhatsApp</h2></div><button onClick={onClose} aria-label="Cerrar">×</button></div><div className="whatsapp-success"><span className="whatsapp-success-icon" aria-hidden="true">✓</span><h3>{result.patientName}</h3><p>El turno ya aparece como confirmado en la agenda.</p><div className="whatsapp-confirmation-card"><span><small>Fecha</small><strong>{formatWhatsAppAppointmentDate(result.date)}</strong></span><span><small>Horario</small><strong>{result.time} h</strong></span><span><small>WhatsApp</small><strong>{result.phone}</strong></span></div><a className="whatsapp-button whatsapp-send" href={result.confirmationUrl} target="_blank" rel="noreferrer">Abrir WhatsApp con el mensaje</a><button type="button" className="secondary-button full" onClick={onViewAgenda}>Ver turno en la agenda</button></div></section></div>;
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal whatsapp-modal" role="dialog" aria-modal="true" aria-labelledby="whatsapp-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">AGENDA RÁPIDA</p><h2 id="whatsapp-modal-title">Agendar desde WhatsApp</h2><small className="modal-subtitle">Paciente y turno en una sola pantalla.</small></div><button onClick={onClose} aria-label="Cerrar" disabled={saving}>×</button></div><form onSubmit={onSubmit}><section className="whatsapp-step"><div className="whatsapp-step-title"><span>1</span><div><strong>Seleccionar paciente</strong><small>Buscá por nombre, DNI o teléfono.</small></div></div>{mode === "search" ? <>{selectedPatient ? <div className="whatsapp-selected-patient"><span className="avatar">{selectedPatient.initials}</span><span><strong>{selectedPatient.name}</strong><small>DNI {selectedPatient.dni}</small></span><button type="button" onClick={() => { setSelectedPatientId(""); setPatientSearch(""); }}>Cambiar</button><input type="hidden" name="patientId" value={selectedPatient.id} /></div> : <><label className="whatsapp-search"><span aria-hidden="true">⌕</span><input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Ej. Ana, 12345678 o 11 5555..." autoFocus /></label>{patientSearch.trim().length >= 2 && <div className="whatsapp-results">{matchingPatients.map((patient) => <button type="button" key={patient.id} onClick={() => setSelectedPatientId(patient.id)}><span className="avatar">{patient.initials}</span><span><strong>{patient.name}</strong><small>DNI {patient.dni} · {patient.phone}</small></span><b>Elegir</b></button>)}{matchingPatients.length === 0 && <p>No encontramos coincidencias.</p>}</div>}<button type="button" className="whatsapp-new-patient" onClick={() => setMode("new")}>＋ Registrar paciente nueva</button></>}</> : <div className="whatsapp-new-fields"><button type="button" className="text-button" onClick={() => setMode("search")}>← Buscar una paciente existente</button><div className="form-grid"><label>Nombre<input name="newFirstName" required maxLength={100} autoCapitalize="words" placeholder="Ej. Ana" /></label><label>Apellido<input name="newLastName" required maxLength={100} autoCapitalize="words" placeholder="Ej. Martínez" /></label><label>DNI<input name="newDni" required minLength={6} maxLength={20} inputMode="numeric" placeholder="00.000.000" /></label><label>Nacimiento<input name="newBirthDate" type="date" required max={localDateInputValue()} /></label><label className="wide">Celular con código de área<input name="newPhone" required maxLength={50} inputMode="tel" placeholder="11 5555-5555" /></label></div></div>}{selectedPatient && <div className="form-grid whatsapp-existing-contact"><label className="wide">Celular para enviar la confirmación<input name="existingPhone" required maxLength={50} inputMode="tel" defaultValue={selectedPatient.phone === "Sin registrar" ? "" : selectedPatient.phone} placeholder="11 5555-5555" /></label></div>}</section><section className="whatsapp-step"><div className="whatsapp-step-title"><span>2</span><div><strong>Elegir turno</strong><small>Los turnos duran 15 minutos.</small></div></div><div className="form-grid"><label>Fecha<input name="date" type="date" required min={localDateInputValue()} defaultValue={defaultDate < localDateInputValue() ? localDateInputValue() : defaultDate} /></label><label>Horario<input name="time" type="time" required step={900} defaultValue="09:00" /></label><label className="wide">Tipo de consulta<select name="consultationType" defaultValue="Control ginecológico"><option>Control ginecológico</option><option>Primera consulta</option><option>PAP y control</option><option>Colposcopía</option><option>Control de embarazo</option><option>Procedimiento</option></select></label></div></section><p className="form-hint">El turno se guardará como confirmado y quedará identificado como agendado por WhatsApp. El mensaje no incluirá información clínica.</p>{error && <div className="data-error modal-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="whatsapp-button" disabled={saving}>{saving ? "Guardando..." : "Guardar turno"}</button></div></form></section></div>;
}

function PatientModal({ patient, contactOnly, saving, error, onClose, onSubmit }: { patient: Patient | null; contactOnly: boolean; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const editing = Boolean(patient);
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="patient-modal-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{contactOnly ? "DATOS ADMINISTRATIVOS" : editing ? "DATOS DE LA PACIENTE" : "NUEVO REGISTRO"}</p><h2 id="patient-modal-title">{contactOnly ? "Editar contacto" : editing ? "Editar paciente" : "Nueva paciente"}</h2></div><button onClick={onClose} aria-label="Cerrar" disabled={saving}>×</button></div><form onSubmit={onSubmit}><div className="form-grid"><label>Nombre<input name="firstName" required minLength={1} maxLength={100} autoCapitalize="words" placeholder="Ej. Ana" defaultValue={patient?.firstName || ""} disabled={contactOnly} /></label><label>Apellido<input name="lastName" required minLength={1} maxLength={100} autoCapitalize="words" placeholder="Ej. Martínez" defaultValue={patient?.lastName || ""} disabled={contactOnly} /></label><label>DNI<input name="dni" required minLength={6} maxLength={20} inputMode="numeric" autoComplete="off" placeholder="00.000.000" defaultValue={patient?.dni || ""} disabled={contactOnly} /></label><label>Fecha de nacimiento<input name="birthDate" type="date" required max={localDateInputValue()} defaultValue={patient?.birthDate || ""} disabled={contactOnly} /></label><label className="wide">Teléfono<input name="phone" maxLength={50} inputMode="tel" autoComplete="tel" placeholder="11 0000-0000" defaultValue={patient?.phone === "Sin registrar" ? "" : patient?.phone || ""} /></label></div><p className="form-hint">{contactOnly ? "Secretaría sólo puede modificar datos de contacto. Los datos identificatorios están protegidos." : "Podés escribir el DNI con o sin puntos. Los antecedentes clínicos se completarán dentro de la ficha."}</p>{error && <div className="data-error modal-error" role="alert">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Guardando..." : editing ? "Guardar cambios" : "Guardar paciente"}</button></div></form></section></div>;
}

function AppointmentModal({ patients, appointment, isWalkIn, defaultDate, saving, deleting, canDelete, error, onClose, onSubmit, onDelete }: { patients: Patient[]; appointment: Appointment | null; isWalkIn: boolean; defaultDate: string; saving: boolean; deleting: boolean; canDelete: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: () => void }) {
  const editing = Boolean(appointment);
  const [openedAt] = useState(() => new Date());
  const appointmentDate = appointment ? new Date(appointment.startsAt) : null;
  const selectedDate = appointmentDate ? dateInputValue(appointmentDate) : defaultDate;
  const selectedTime = appointmentDate ? `${String(appointmentDate.getHours()).padStart(2, "0")}:${String(appointmentDate.getMinutes()).padStart(2, "0")}` : isWalkIn ? `${String(openedAt.getHours()).padStart(2, "0")}:${String(openedAt.getMinutes()).padStart(2, "0")}` : "09:00";
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title" onMouseDown={(e) => e.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">{isWalkIn ? "RECEPCIÓN" : "AGENDA"}</p><h2 id="appointment-modal-title">{editing ? "Editar turno" : isWalkIn ? "Paciente sin turno" : "Nuevo turno"}</h2>{isWalkIn && <small className="modal-subtitle">Se registrará como presente en la agenda de hoy.</small>}</div><button onClick={onClose} aria-label="Cerrar" disabled={saving}>×</button></div><form onSubmit={onSubmit}><div className="form-grid"><label className="wide">Paciente<select name="patientId" required defaultValue={appointment?.patientId || ""}><option value="" disabled>{patients.length ? "Seleccionar paciente" : "Primero registrá una paciente"}</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label><label>Fecha<input name="date" type="date" required defaultValue={selectedDate} /></label><label>Horario<input name="time" type="time" required defaultValue={selectedTime} /></label><label>Tipo de consulta<select name="consultationType" defaultValue={appointment?.type || "Control ginecológico"}><option>Control ginecológico</option><option>Primera consulta</option><option>PAP y control</option><option>Colposcopía</option><option>Control de embarazo</option><option>Procedimiento</option></select></label><label className="wide">Nota administrativa<input name="administrativeNotes" maxLength={500} placeholder="Opcional. No incluir información clínica sensible." defaultValue={appointment?.administrativeNotes || ""} /></label></div>{error && <div className="data-error modal-error" role="alert">{error}</div>}<div className={`form-actions ${editing && canDelete ? "form-actions-between" : ""}`}>{editing && canDelete && <button type="button" className="danger-button" onClick={onDelete} disabled={saving}>{deleting ? "Eliminando..." : "Eliminar turno"}</button>}<div className="form-actions-group"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary-button" disabled={saving || patients.length === 0}>{saving && !deleting ? "Guardando..." : editing ? "Guardar cambios" : isWalkIn ? "Agregar a la agenda" : "Guardar turno"}</button></div></div></form></section></div>;
}

function PatientDrawer({ patient, profileName, profileRole, deleting, deleteError, onDelete, onEdit, onClose }: { patient: Patient; profileName: string; profileRole: string; deleting: boolean; deleteError: string; onDelete: () => void; onEdit: () => void; onClose: () => void }) {
  const clinicalAccess = profileRole === "professional" || profileRole === "administrator";
  const canDelete = profileRole === "administrator";
  const [tab, setTab] = useState<"summary" | "history" | "gynecology">("summary");
  const [entries, setEntries] = useState<ClinicalEntry[]>([]);
  const [gynecologicalHistory, setGynecologicalHistory] = useState<GynecologicalHistory | null>(null);
  const [clinicalLoading, setClinicalLoading] = useState(clinicalAccess);
  const [clinicalError, setClinicalError] = useState("");
  const [consultationOpen, setConsultationOpen] = useState(false);
  const [consultationSaving, setConsultationSaving] = useState(false);
  const [consultationError, setConsultationError] = useState("");
  const [gynecologySaving, setGynecologySaving] = useState(false);
  const [gynecologyMessage, setGynecologyMessage] = useState("");

  useEffect(() => {
    if (!clinicalAccess) return;
    let mounted = true;

    async function loadClinicalData() {
      const supabase = createClient();
      const [entriesResult, historyResult] = await Promise.all([
        supabase
          .from("clinical_entries")
          .select("id, consultation_date, status, reason, symptoms_and_evolution, physical_exam, diagnosis_impression, treatment_indications, requested_studies, follow_up")
          .eq("patient_id", patient.id)
          .order("consultation_date", { ascending: false }),
        supabase
          .from("gynecological_histories")
          .select("patient_id, last_menstrual_period, menarche_age, cycle_description, contraception, pregnancies, births, cesareans, pregnancy_losses, menopause_notes, gynecological_history, previous_surgeries, family_history, hpv_vaccination, last_pap_date, last_hpv_test_date, last_colposcopy_date, last_mammogram_date")
          .eq("patient_id", patient.id)
          .maybeSingle(),
      ]);

      if (!mounted) return;

      if (entriesResult.error || historyResult.error) {
        setClinicalError("No pudimos cargar toda la información clínica.");
      }
      setEntries((entriesResult.data || []) as ClinicalEntry[]);
      setGynecologicalHistory((historyResult.data || null) as GynecologicalHistory | null);
      setClinicalLoading(false);
    }

    loadClinicalData();
    return () => { mounted = false; };
  }, [patient.id, clinicalAccess]);

  async function saveConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConsultationSaving(true);
    setConsultationError("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldFinalize = submitter?.value === "finalize";
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const professionalId = claimsData?.claims?.sub;

    if (!professionalId) {
      setConsultationError("La sesión no es válida. Volvé a iniciar sesión.");
      setConsultationSaving(false);
      return;
    }

    const { data: draft, error: insertError } = await supabase
      .from("clinical_entries")
      .insert({
        patient_id: patient.id,
        professional_id: professionalId,
        status: "draft",
        reason: String(form.get("reason") || "").trim() || null,
        symptoms_and_evolution: String(form.get("evolution") || "").trim() || null,
        physical_exam: String(form.get("physicalExam") || "").trim() || null,
        diagnosis_impression: String(form.get("diagnosis") || "").trim() || null,
        treatment_indications: String(form.get("treatment") || "").trim() || null,
        requested_studies: String(form.get("studies") || "").trim() || null,
        follow_up: String(form.get("followUp") || "").trim() || null,
        private_notes: String(form.get("privateNotes") || "").trim() || null,
      })
      .select("id, consultation_date, status, reason, symptoms_and_evolution, physical_exam, diagnosis_impression, treatment_indications, requested_studies, follow_up")
      .single();

    if (insertError || !draft) {
      setConsultationError("No pudimos guardar la consulta. Revisá los datos e intentá nuevamente.");
      setConsultationSaving(false);
      return;
    }

    let savedEntry = draft as ClinicalEntry;
    if (shouldFinalize) {
      const { data: finalized, error: finalizeError } = await supabase
        .from("clinical_entries")
        .update({ status: "finalized" })
        .eq("id", draft.id)
        .select("id, consultation_date, status, reason, symptoms_and_evolution, physical_exam, diagnosis_impression, treatment_indications, requested_studies, follow_up")
        .single();

      if (finalizeError || !finalized) {
        setEntries((current) => [savedEntry, ...current]);
        setConsultationError("La consulta se guardó como borrador, pero no pudo finalizarse.");
        setConsultationSaving(false);
        return;
      }
      savedEntry = finalized as ClinicalEntry;
    }

    setEntries((current) => [savedEntry, ...current]);
    setConsultationSaving(false);
    setConsultationOpen(false);
    setTab("history");
  }

  async function saveGynecologicalHistory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGynecologySaving(true);
    setGynecologyMessage("");
    const form = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const value = String(form.get(name) || "").trim();
      return value === "" ? null : Number(value);
    };
    const optionalText = (name: string) => String(form.get(name) || "").trim() || null;
    const supabase = createClient();
    const payload = {
      patient_id: patient.id,
      last_menstrual_period: optionalText("lastMenstrualPeriod"),
      menarche_age: optionalNumber("menarcheAge"),
      cycle_description: optionalText("cycleDescription"),
      contraception: optionalText("contraception"),
      pregnancies: optionalNumber("pregnancies"),
      births: optionalNumber("births"),
      cesareans: optionalNumber("cesareans"),
      pregnancy_losses: optionalNumber("pregnancyLosses"),
      menopause_notes: optionalText("menopauseNotes"),
      gynecological_history: optionalText("gynecologicalHistory"),
      previous_surgeries: optionalText("previousSurgeries"),
      family_history: optionalText("familyHistory"),
      hpv_vaccination: optionalText("hpvVaccination"),
      last_pap_date: optionalText("lastPapDate"),
      last_hpv_test_date: optionalText("lastHpvTestDate"),
      last_colposcopy_date: optionalText("lastColposcopyDate"),
      last_mammogram_date: optionalText("lastMammogramDate"),
    };

    const { data, error } = await supabase
      .from("gynecological_histories")
      .upsert(payload, { onConflict: "patient_id" })
      .select()
      .single();

    if (error || !data) {
      setGynecologyMessage("No pudimos guardar los antecedentes. Revisá los datos.");
    } else {
      setGynecologicalHistory(data as GynecologicalHistory);
      setGynecologyMessage("Antecedentes guardados correctamente.");
    }
    setGynecologySaving(false);
  }

  const lastEntry = entries[0];

  return <>
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="patient-drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-top"><button onClick={onClose}>← Volver</button><button onClick={onEdit}>{clinicalAccess ? "Editar datos" : "Editar contacto"}</button></div>
        <div className="drawer-patient"><span className="avatar avatar-xl">{patient.initials}</span><h2>{patient.name}</h2><p>DNI {patient.dni} · {patient.age} años</p><span className="status status-confirmed">Ficha activa</span></div>
        <div className="drawer-actions">{clinicalAccess && <button className="primary-button" onClick={() => { setConsultationError(""); setConsultationOpen(true); }} disabled={deleting}>＋ Nueva consulta</button>}<button className="secondary-button" onClick={onEdit} disabled={deleting}>{clinicalAccess ? "Editar paciente" : "Editar contacto"}</button>{canDelete && <button className="danger-button" onClick={onDelete} disabled={deleting}>{deleting ? "Eliminando..." : "Eliminar paciente"}</button>}</div>
        {deleteError && <div className="data-error drawer-error" role="alert">{deleteError}</div>}
        <div className="drawer-tabs"><button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>Resumen</button>{clinicalAccess && <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Historia clínica</button>}{clinicalAccess && <button className={tab === "gynecology" ? "active" : ""} onClick={() => setTab("gynecology")}>Ginecología</button>}</div>
        {clinicalError && <div className="data-error drawer-error">{clinicalError}</div>}
        {tab === "summary" && (clinicalAccess ? <section className="clinical-summary"><h3>Resumen de la paciente</h3><div className="info-grid"><span><small>Teléfono</small><strong>{patient.phone}</strong></span><span><small>Última consulta</small><strong>{lastEntry ? new Date(lastEntry.consultation_date).toLocaleDateString("es-AR") : "Sin consultas"}</strong></span><span><small>Próximo turno</small><strong>{patient.nextVisit}</strong></span><span><small>Estado clínico</small><strong>{clinicalLoading ? "Cargando..." : `${entries.length} consultas`}</strong></span></div><h3>Última consulta</h3>{lastEntry ? <ClinicalTimelineEntry entry={lastEntry} profileName={profileName} /> : <div className="compact-empty">Todavía no hay consultas registradas.</div>}</section> : <section className="clinical-summary"><h3>Datos administrativos</h3><div className="info-grid"><span><small>Teléfono</small><strong>{patient.phone}</strong></span><span><small>DNI</small><strong>{patient.dni}</strong></span><span><small>Edad</small><strong>{patient.age} años</strong></span><span><small>Próximo turno</small><strong>{patient.nextVisit}</strong></span></div><div className="privacy-card"><span>◇</span><div><strong>Acceso administrativo</strong><p>La historia clínica y los antecedentes médicos están reservados al profesional.</p></div></div></section>)}
        {tab === "history" && <section className="clinical-summary"><div className="section-title-row"><h3>Historia clínica</h3><span>{entries.length} registros</span></div>{clinicalLoading ? <div className="compact-empty">Cargando historia clínica...</div> : entries.length ? entries.map((entry) => <ClinicalTimelineEntry key={entry.id} entry={entry} profileName={profileName} />) : <div className="compact-empty">Todavía no hay consultas registradas.</div>}</section>}
        {tab === "gynecology" && <GynecologicalHistoryForm history={gynecologicalHistory} saving={gynecologySaving} message={gynecologyMessage} onSubmit={saveGynecologicalHistory} />}
      </aside>
    </div>
    {consultationOpen && <ConsultationModal patientName={patient.name} saving={consultationSaving} error={consultationError} onClose={() => { if (!consultationSaving) setConsultationOpen(false); }} onSubmit={saveConsultation} />}
  </>;
}

function ClinicalTimelineEntry({ entry, profileName }: { entry: ClinicalEntry; profileName: string }) {
  return <article className="timeline-item"><i /><div><small>{new Date(entry.consultation_date).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" }).toUpperCase()} · {profileName.toUpperCase()}</small><span className={entry.status === "finalized" ? "status status-confirmed" : "status status-pending"}>{entry.status === "finalized" ? "Finalizada" : "Borrador"}</span><strong>{entry.reason || "Consulta sin motivo registrado"}</strong>{entry.symptoms_and_evolution && <p><b>Evolución:</b> {entry.symptoms_and_evolution}</p>}{entry.diagnosis_impression && <p><b>Impresión:</b> {entry.diagnosis_impression}</p>}{entry.treatment_indications && <p><b>Indicaciones:</b> {entry.treatment_indications}</p>}</div></article>;
}

function GynecologicalHistoryForm({ history, saving, message, onSubmit }: { history: GynecologicalHistory | null; saving: boolean; message: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="clinical-summary"><div className="section-title-row"><h3>Antecedentes ginecológicos</h3><span>{history ? "Actualizados" : "Sin completar"}</span></div><form className="clinical-form" onSubmit={onSubmit}><div className="form-grid"><label>Última menstruación<input name="lastMenstrualPeriod" type="date" defaultValue={history?.last_menstrual_period || ""} /></label><label>Edad de menarca<input name="menarcheAge" type="number" min="5" max="25" defaultValue={history?.menarche_age ?? ""} /></label><label className="wide">Descripción del ciclo<input name="cycleDescription" defaultValue={history?.cycle_description || ""} placeholder="Regularidad, duración y observaciones" /></label><label className="wide">Anticoncepción<input name="contraception" defaultValue={history?.contraception || ""} /></label><label>Embarazos<input name="pregnancies" type="number" min="0" defaultValue={history?.pregnancies ?? ""} /></label><label>Partos<input name="births" type="number" min="0" defaultValue={history?.births ?? ""} /></label><label>Cesáreas<input name="cesareans" type="number" min="0" defaultValue={history?.cesareans ?? ""} /></label><label>Pérdidas gestacionales<input name="pregnancyLosses" type="number" min="0" defaultValue={history?.pregnancy_losses ?? ""} /></label><label className="wide">Menopausia<textarea name="menopauseNotes" defaultValue={history?.menopause_notes || ""} /></label><label className="wide">Antecedentes ginecológicos<textarea name="gynecologicalHistory" defaultValue={history?.gynecological_history || ""} /></label><label className="wide">Cirugías previas<textarea name="previousSurgeries" defaultValue={history?.previous_surgeries || ""} /></label><label className="wide">Antecedentes familiares<textarea name="familyHistory" defaultValue={history?.family_history || ""} /></label><label className="wide">Vacunación HPV<input name="hpvVaccination" defaultValue={history?.hpv_vaccination || ""} /></label><label>Último PAP<input name="lastPapDate" type="date" defaultValue={history?.last_pap_date || ""} /></label><label>Último test HPV<input name="lastHpvTestDate" type="date" defaultValue={history?.last_hpv_test_date || ""} /></label><label>Última colposcopía<input name="lastColposcopyDate" type="date" defaultValue={history?.last_colposcopy_date || ""} /></label><label>Última mamografía<input name="lastMammogramDate" type="date" defaultValue={history?.last_mammogram_date || ""} /></label></div>{message && <div className={message.includes("correctamente") ? "data-success" : "data-error modal-error"}>{message}</div>}<div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? "Guardando..." : "Guardar antecedentes"}</button></div></form></section>;
}

function ConsultationModal({ patientName, saving, error, onClose, onSubmit }: { patientName: string; saving: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="modal-backdrop clinical-modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal clinical-modal" role="dialog" aria-modal="true" aria-labelledby="consultation-modal-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><div><p className="eyebrow">HISTORIA CLÍNICA</p><h2 id="consultation-modal-title">Nueva consulta</h2><small>{patientName}</small></div><button onClick={onClose} aria-label="Cerrar" disabled={saving}>×</button></div><form onSubmit={onSubmit}><div className="form-grid"><label className="wide">Motivo de consulta<textarea name="reason" required autoFocus /></label><label className="wide">Síntomas y evolución<textarea name="evolution" /></label><label className="wide">Examen físico<textarea name="physicalExam" /></label><label className="wide">Diagnóstico o impresión clínica<textarea name="diagnosis" /></label><label className="wide">Tratamiento e indicaciones<textarea name="treatment" /></label><label className="wide">Estudios solicitados<textarea name="studies" /></label><label className="wide">Próximo control<textarea name="followUp" /></label><label className="wide">Notas privadas<textarea name="privateNotes" /></label></div><p className="form-hint">Una consulta finalizada no puede modificarse ni eliminarse. Las correcciones futuras se registrarán como una nueva versión.</p>{error && <div className="data-error modal-error" role="alert">{error}</div>}<div className="form-actions consultation-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="secondary-button" name="saveMode" value="draft" disabled={saving}>{saving ? "Guardando..." : "Guardar borrador"}</button><button className="primary-button" name="saveMode" value="finalize" disabled={saving}>{saving ? "Guardando..." : "Finalizar consulta"}</button></div></form></section></div>;
}
