import type { ConsentOrigin, Lead } from "../types/domain";
import { isValidInternationalPhone, normalizePhone } from "../utils/formatters";

export interface ImportPreviewRow {
  rowNumber: number;
  lead: Lead;
  canReceiveWhatsapp: boolean;
  errors: string[];
  warnings: string[];
  duplicateOf?: string;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  total: number;
  validForWhatsapp: number;
  blockedByConsent: number;
  invalidPhones: number;
  duplicates: number;
}

const consentValues = new Set(["si", "sí", "true", "1", "yes", "y"]);

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(normalizeKey);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index]?.trim() ?? "";
      return acc;
    }, {});
  });
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

export async function readLeadFile(file: File): Promise<Record<string, string>[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils
      .sheet_to_json<Record<string, string>>(sheet, { defval: "" })
      .map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), String(value)]))
      );
  }

  return parseCsv(await file.text());
}

export function buildImportPreview(rows: Record<string, string>[], existingLeads: Lead[]): ImportPreview {
  const existingPhones = new Map(existingLeads.map((lead) => [lead.telefono, lead.id]));
  const existingEmails = new Map(existingLeads.map((lead) => [lead.email.toLowerCase(), lead.id]));
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  const previewRows = rows.map<ImportPreviewRow>((row, index) => {
    const phone = normalizePhone(row.telefono ?? "");
    const email = (row.email ?? "").trim().toLowerCase();
    const consentRaw = normalizeKey(row.consentimiento_whatsapp ?? "");
    const hasConsent = consentValues.has(consentRaw);
    const errors: string[] = [];
    const warnings: string[] = [];
    let duplicateOf: string | undefined;

    if (!isValidInternationalPhone(phone)) errors.push("Teléfono inválido. Usa formato internacional, por ejemplo +34XXXXXXXXX.");
    if (!hasConsent) warnings.push("Sin consentimiento WhatsApp: se guardará como pendiente_consentimiento.");

    if (existingPhones.has(phone)) duplicateOf = existingPhones.get(phone);
    if (!duplicateOf && email && existingEmails.has(email)) duplicateOf = existingEmails.get(email);
    if (!duplicateOf && seenPhones.has(phone)) duplicateOf = "otra fila del archivo";
    if (!duplicateOf && email && seenEmails.has(email)) duplicateOf = "otra fila del archivo";
    if (duplicateOf) warnings.push(`Posible duplicado detectado: ${duplicateOf}.`);

    seenPhones.add(phone);
    if (email) seenEmails.add(email);

    const lead: Lead = {
      id: `import-${Date.now()}-${index}`,
      nombreNegocio: row.nombre_negocio ?? "",
      personaContacto: row.persona_contacto ?? "",
      telefono: phone,
      email,
      direccion: row.direccion ?? "",
      ciudad: row.ciudad ?? "",
      zona: row.zona ?? "",
      sector: row.sector ?? "",
      web: row.web ?? "",
      notas: row.notas ?? "",
      estado: hasConsent ? "consentimiento_obtenido" : "pendiente_consentimiento",
      etiquetas: [],
      grupoIds: [],
      comercialAsignado: row.comercial_asignado ?? "",
      tieneConsentimientoWhatsapp: hasConsent,
      fechaConsentimiento: hasConsent ? row.fecha_consentimiento || new Date().toISOString() : undefined,
      origenConsentimiento: (row.origen_consentimiento as ConsentOrigin) || undefined,
      textoConsentimientoAceptado: hasConsent
        ? "Acepto recibir comunicaciones comerciales de Connessia por WhatsApp y puedo solicitar la baja."
        : undefined,
      proximaAccion: hasConsent ? "Revisar para campaña" : "Solicitar consentimiento por canal permitido",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return {
      rowNumber: index + 2,
      lead,
      canReceiveWhatsapp: hasConsent && errors.length === 0 && !duplicateOf,
      errors,
      warnings,
      duplicateOf
    };
  });

  return {
    rows: previewRows,
    total: previewRows.length,
    validForWhatsapp: previewRows.filter((row) => row.canReceiveWhatsapp).length,
    blockedByConsent: previewRows.filter((row) => !row.lead.tieneConsentimientoWhatsapp).length,
    invalidPhones: previewRows.filter((row) => row.errors.some((error) => error.includes("Teléfono"))).length,
    duplicates: previewRows.filter((row) => row.duplicateOf).length
  };
}
