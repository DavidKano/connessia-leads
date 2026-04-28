export type ProviderName = "mock" | "meta_cloud" | "spoki" | "twilio" | "360dialog";
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

export interface Lead {
  id?: string;
  nombreNegocio: string;
  personaContacto: string;
  telefono: string;
  email?: string;
  estado: LeadStatus;
  comercialAsignado?: string;
  tieneConsentimientoWhatsapp: boolean;
  fechaBaja?: string;
  motivoBaja?: string;
  updatedAt?: string;
}

export interface MessageQueueItem {
  id?: string;
  leadId: string;
  campaignId?: string;
  phone: string;
  messageType: "template" | "text" | "media";
  templateId?: string;
  body: string;
  mediaUrl?: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  scheduledAt: string;
  sentAt?: string;
  providerMessageId?: string;
  errorMessage?: string;
  retries: number;
}

export interface IncomingMessage {
  from: string;
  body: string;
  providerMessageId?: string;
  receivedAt: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}
