import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppConfirmationMessage,
  buildWhatsAppConfirmationUrl,
  normalizeWhatsAppPhone,
} from "../lib/whatsapp.ts";

const confirmation = {
  patientName: "Ana Martínez",
  date: "2026-08-17",
  time: "15:30",
};

test("normaliza celulares argentinos para WhatsApp", () => {
  assert.equal(normalizeWhatsAppPhone("11 5555-5555"), "5491155555555");
  assert.equal(normalizeWhatsAppPhone("+54 9 11 5555-5555"), "5491155555555");
  assert.equal(normalizeWhatsAppPhone("+54 11 5555-5555"), "5491155555555");
});

test("no dirige a un número incompleto", () => {
  assert.equal(normalizeWhatsAppPhone("555-123"), "");
});

test("genera una confirmación sin información clínica", () => {
  const message = buildWhatsAppConfirmationMessage(confirmation);
  assert.match(message, /^Hola Ana,/);
  assert.match(message, /lunes,? 17 de agosto/);
  assert.match(message, /15:30 h/);
  assert.doesNotMatch(message, /consulta|diagnóstico|tratamiento/i);
});

test("crea un enlace dirigido a la paciente", () => {
  const url = buildWhatsAppConfirmationUrl("11 5555-5555", confirmation);
  assert.match(url, /^https:\/\/wa\.me\/5491155555555\?text=/);
  assert.match(decodeURIComponent(url), /Dra\. Adriana Caro/);
});
