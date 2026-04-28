import type { Lead, MessageTemplate, Settings } from "../types/domain";

export const phoneRegex = /^\+[1-9]\d{8,14}$/;

export function isValidInternationalPhone(phone: string) {
  return phoneRegex.test(normalizePhone(phone));
}

export function normalizePhone(phone: string) {
  return phone.replace(/\s+/g, "").replace(/[()-]/g, "");
}

export function formatDateTime(value?: string) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}

export function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function renderTemplate(
  template: Pick<MessageTemplate, "body">,
  lead: Lead,
  settings: Settings
) {
  const variables: Record<string, string> = {
    nombre_negocio: lead.nombreNegocio,
    persona_contacto: lead.personaContacto,
    sector: lead.sector,
    zona: lead.zona,
    nombre_comercial: settings.defaultCommercialName,
    link_demo: "https://connessia.example/demo",
    link_landing: "https://connessia.example"
  };

  return Object.entries(variables).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, value || ""),
    template.body
  );
}

export function classifyReply(text: string): "positive" | "negative" | "unsubscribe" | "ambiguous" {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  if (/\b(baja|stop|no quiero|eliminar|no me contacteis|no me contactes)\b/.test(normalized)) {
    return "unsubscribe";
  }

  if (/^(no|no gracias|nop|negativo)\b/.test(normalized)) {
    return "negative";
  }

  if (/\b(si|me interesa|info|vale|ok|adelante|claro|demo)\b/.test(normalized)) {
    return "positive";
  }

  return "ambiguous";
}
