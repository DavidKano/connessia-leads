export type UserRole = "admin" | "comercial" | "visor";

export type LeadStatus =
  | "nuevo"
  | "pendiente_consentimiento"
  | "consentimiento_obtenido"
  | "campaña_enviada"
  | "interesado"
  | "no_interesado"
  | "demo_agendada"
  | "convertido"
  | "baja"
  | "bloqueado"
  | "error_envio"
  | "respuesta_ambigua"
  | "sin_respuesta";

export type ConsentOrigin =
  | "formulario web"
  | "llamada"
  | "email"
  | "QR"
  | "landing"
  | "cliente inició WhatsApp"
  | "otro";

export type TemplateType =
  | "plantilla_inicial"
  | "plantilla_seguimiento"
  | "plantilla_info"
  | "plantilla_recordatorio_demo"
  | "plantilla_baja"
  | "plantilla_error";

export type TemplateStatus =
  | "borrador"
  | "enviada_a_revision"
  | "aprobada"
  | "rechazada"
  | "pausada";

export type CampaignStatus = "borrador" | "activa" | "pausada" | "finalizada";
export type ProviderName = "mock" | "meta_cloud" | "spoki" | "twilio" | "360dialog";
export type QueueStatus = "pending" | "processing" | "sent" | "failed" | "cancelled";
export type Direction = "inbound" | "outbound";
export type TaskStatus = "pendiente" | "hecha" | "cancelada";
export type DemoStatus = "programada" | "realizada" | "cancelada";
export type AssetType = "imagen" | "pdf" | "video";

export interface AppUser {
  uid: string;
  nombre: string;
  email: string;
  role: UserRole;
  activo: boolean;
  createdAt: string;
}

export interface Lead {
  id: string;
  nombreNegocio: string;
  personaContacto: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  zona: string;
  sector: string;
  web: string;
  notas: string;
  estado: LeadStatus;
  etiquetas: string[];
  comercialAsignado: string;
  tieneConsentimientoWhatsapp: boolean;
  fechaConsentimiento?: string;
  origenConsentimiento?: ConsentOrigin;
  textoConsentimientoAceptado?: string;
  ipConsentimiento?: string;
  urlOrigenConsentimiento?: string;
  fechaBaja?: string;
  motivoBaja?: string;
  ultimoContacto?: string;
  proximaAccion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  nombre: string;
  tipo: TemplateType;
  proveedor: ProviderName;
  externalTemplateId?: string;
  idioma: string;
  categoria: string;
  body: string;
  variables: string[];
  estado: TemplateStatus;
  createdAt: string;
}

export interface Campaign {
  id: string;
  nombre: string;
  descripcion: string;
  segmento: {
    zonas: string[];
    sectores: string[];
    requireConsent: boolean;
  };
  estado: CampaignStatus;
  plantillaInicialId: string;
  plantillaSeguimientoId?: string;
  plantillaInfoId?: string;
  assetInfoId?: string;
  maxSeguimientos: number;
  diasParaSeguimiento: number;
  dailyLimit?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  leadId: string;
  campaignId?: string;
  direction: Direction;
  channel: "whatsapp";
  body: string;
  mediaUrl?: string;
  providerMessageId?: string;
  status: string;
  createdAt: string;
}

export interface QueueItem {
  id: string;
  leadId: string;
  campaignId?: string;
  phone: string;
  messageType: "template" | "text" | "media";
  templateId?: string;
  body: string;
  mediaUrl?: string;
  status: QueueStatus;
  scheduledAt: string;
  sentAt?: string;
  providerMessageId?: string;
  errorMessage?: string;
  retries: number;
}

export interface DoNotContact {
  id: string;
  phone: string;
  email?: string;
  reason: string;
  source: string;
  createdAt: string;
}

export interface Task {
  id: string;
  leadId: string;
  title: string;
  description: string;
  dueDate: string;
  assignedTo: string;
  status: TaskStatus;
  priority: "baja" | "media" | "alta";
  createdAt: string;
}

export interface Demo {
  id: string;
  leadId: string;
  date: string;
  time: string;
  assignedTo: string;
  status: DemoStatus;
  notes?: string;
  meetingUrl?: string;
  result?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface CommercialAsset {
  id: string;
  name: string;
  type: AssetType;
  url: string;
  storagePath: string;
  createdAt: string;
}

export interface Settings {
  whatsappProvider: ProviderName;
  dailyLimit: number;
  hourlyLimit: number;
  emergencyPaused: boolean;
  businessName: string;
  defaultCommercialName: string;
  whatsappChannel: {
    provider: ProviderName;
    businessPhone: string;
    businessAccountId: string;
    phoneNumberId: string;
    webhookVerifyToken: string;
    connectionStatus: "simulado" | "pendiente" | "conectado" | "error";
  };
}

export interface Metrics {
  totalLeads: number;
  leadsConConsentimiento: number;
  pendientesContactar: number;
  interesados: number;
  noInteresados: number;
  convertidos: number;
  mensajesEnviadosHoy: number;
  respuestasRecibidas: number;
  tasaRespuesta: number;
  tasaInteres: number;
  proximasDemos: number;
  campanasActivas: number;
  mensajesFallidos: number;
  respuestasSi: number;
  respuestasNo: number;
  respuestasAmbiguas: number;
  demosAgendadas: number;
  tasaConversion: number;
}
