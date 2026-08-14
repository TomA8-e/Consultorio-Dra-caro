export type WhatsAppConfirmation = {
  patientName: string;
  date: string;
  time: string;
};

export function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (/^549\d{10}$/.test(digits)) return digits;
  if (/^54\d{10}$/.test(digits)) return `549${digits.slice(2)}`;
  if (/^\d{10}$/.test(digits)) return `549${digits}`;

  return "";
}

export function formatWhatsAppAppointmentDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function buildWhatsAppConfirmationMessage({ patientName, date, time }: WhatsAppConfirmation) {
  const appointmentDate = formatWhatsAppAppointmentDate(date);
  const firstName = patientName.trim().split(/\s+/)[0] || "";

  return `Hola ${firstName}, tu turno con la Dra. Adriana Caro quedó reservado para el ${appointmentDate} a las ${time} h. Si necesitás modificarlo, respondé por este medio.`;
}

export function buildWhatsAppConfirmationUrl(phone: string, confirmation: WhatsAppConfirmation) {
  const target = normalizeWhatsAppPhone(phone);
  const message = encodeURIComponent(buildWhatsAppConfirmationMessage(confirmation));
  return target ? `https://wa.me/${target}?text=${message}` : `https://wa.me/?text=${message}`;
}
