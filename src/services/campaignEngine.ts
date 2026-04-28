import type {
  Campaign,
  CommercialAsset,
  DoNotContact,
  Lead,
  Message,
  MessageTemplate,
  QueueItem,
  Settings,
  Task
} from "../types/domain";
import { classifyReply, isValidInternationalPhone, normalizePhone, renderTemplate } from "../utils/formatters";
import { getWhatsAppProvider } from "./whatsappProvider";

export interface EngineState {
  leads: Lead[];
  templates: MessageTemplate[];
  campaigns: Campaign[];
  messages: Message[];
  queue: QueueItem[];
  doNotContact: DoNotContact[];
  tasks: Task[];
  assets: CommercialAsset[];
  settings: Settings;
}

export interface EngineResult {
  state: EngineState;
  notice: string;
}

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function canSendToLead(lead: Lead, doNotContact: DoNotContact[]) {
  const phone = normalizePhone(lead.telefono);
  if (!lead.tieneConsentimientoWhatsapp) return "No tiene consentimiento WhatsApp registrado.";
  if (lead.estado === "baja" || lead.estado === "bloqueado") return "El lead está en baja o bloqueado.";
  if (!isValidInternationalPhone(phone)) return "El teléfono no tiene formato internacional válido.";
  if (doNotContact.some((entry) => normalizePhone(entry.phone) === phone || entry.email?.toLowerCase() === lead.email.toLowerCase())) {
    return "El lead está en la lista de exclusión.";
  }
  return null;
}

export function enqueueCampaign(state: EngineState, campaignId: string): EngineResult {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return { state, notice: "Campaña no encontrada." };
  if (state.settings.emergencyPaused) return { state, notice: "Pausa de emergencia activa. No se encoló nada." };

  const template = state.templates.find((item) => item.id === campaign.plantillaInicialId);
  if (!template || template.estado !== "aprobada") {
    return { state, notice: "La plantilla inicial debe estar aprobada antes de activar la campaña." };
  }

  const selectedLeads = state.leads.filter((lead) => {
    const selectedByGroup =
      campaign.segmento.grupoIds.length > 0 &&
      campaign.segmento.grupoIds.some((groupId) => lead.grupoIds.includes(groupId));
    const zoneMatch = campaign.segmento.zonas.length === 0 || campaign.segmento.zonas.includes(lead.zona);
    const sectorMatch =
      campaign.segmento.sectores.length === 0 || campaign.segmento.sectores.includes(lead.sector);
    const selectedByLegacySegment = campaign.segmento.grupoIds.length === 0 && zoneMatch && sectorMatch;
    return selectedByGroup || selectedByLegacySegment;
  });
  const blockedReasons = selectedLeads
    .map((lead) => ({ lead, reason: canSendToLead(lead, state.doNotContact) }))
    .filter((item): item is { lead: Lead; reason: string } => Boolean(item.reason));
  const targetLeads = selectedLeads.filter((lead) => !canSendToLead(lead, state.doNotContact));

  if (selectedLeads.length > 0 && targetLeads.length === 0) {
    const firstReason = blockedReasons[0];
    return {
      state,
      notice: firstReason
        ? `0 mensajes preparados. ${firstReason.lead.nombreNegocio}: ${firstReason.reason}`
        : "0 mensajes preparados. Revisa consentimiento, teléfono o lista de exclusión."
    };
  }

  const scheduledAt = new Date().toISOString();
  const nextQueue = [
    ...state.queue,
    ...targetLeads.map<QueueItem>((lead) => ({
      id: uid("queue"),
      leadId: lead.id,
      campaignId: campaign.id,
      phone: normalizePhone(lead.telefono),
      messageType: "template",
      templateId: template.id,
      body: renderTemplate(template, lead, state.settings),
      status: "pending",
      scheduledAt,
      retries: 0
    }))
  ];

  const queuedIds = new Set(targetLeads.map((lead) => lead.id));
  const nextLeads = state.leads.map((lead) =>
    queuedIds.has(lead.id)
      ? {
          ...lead,
          estado: "campaña_enviada" as const,
          proximaAccion: "Esperar respuesta",
          updatedAt: scheduledAt
        }
      : lead
  );

  return {
    state: {
      ...state,
      leads: nextLeads,
      queue: nextQueue,
      campaigns: state.campaigns.map((item) =>
        item.id === campaign.id ? { ...item, estado: "activa", updatedAt: scheduledAt } : item
      )
    },
    notice: `${targetLeads.length} mensajes validados y preparados para WhatsApp Web.`
  };
}

export async function processQueue(state: EngineState, maxItems = 10): Promise<EngineResult> {
  if (state.settings.emergencyPaused) return { state, notice: "Pausa de emergencia activa." };
  const provider = getWhatsAppProvider();
  const pending = state.queue.filter((item) => item.status === "pending").slice(0, maxItems);
  let nextState = { ...state, queue: [...state.queue], messages: [...state.messages] };

  for (const item of pending) {
    const lead = nextState.leads.find((candidate) => candidate.id === item.leadId);
    if (!lead) continue;

    const blockedReason = canSendToLead(lead, nextState.doNotContact);
    const itemIndex = nextState.queue.findIndex((candidate) => candidate.id === item.id);
    if (blockedReason) {
      nextState.queue[itemIndex] = { ...item, status: "cancelled", errorMessage: blockedReason };
      continue;
    }

    const result =
      item.messageType === "media"
        ? await provider.sendMediaMessage({ to: item.phone, body: item.body, mediaUrl: item.mediaUrl })
        : item.messageType === "template"
          ? await provider.sendTemplateMessage({ to: item.phone, body: item.body, templateId: item.templateId })
          : await provider.sendTextMessage({ to: item.phone, body: item.body });

    const sentAt = new Date().toISOString();
    nextState.queue[itemIndex] = {
      ...item,
      status: result.ok ? "sent" : "failed",
      sentAt: result.ok ? sentAt : undefined,
      providerMessageId: result.providerMessageId,
      errorMessage: result.errorMessage,
      retries: result.ok ? item.retries : item.retries + 1
    };

    nextState.messages.push({
      id: uid("msg"),
      leadId: item.leadId,
      campaignId: item.campaignId,
      direction: "outbound",
      channel: "whatsapp",
      body: item.body,
      mediaUrl: item.mediaUrl,
      providerMessageId: result.providerMessageId,
      status: result.ok ? "sent" : "failed",
      createdAt: sentAt
    });
  }

  return { state: nextState, notice: `${pending.length} mensajes procesados en modo local.` };
}

export function handleIncomingReply(state: EngineState, leadId: string, body: string): EngineResult {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return { state, notice: "Lead no encontrado." };

  const replyKind = classifyReply(body);
  const now = new Date().toISOString();
  const inbound: Message = {
    id: uid("msg"),
    leadId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    status: "received",
    createdAt: now
  };

  const templates = {
    info: state.templates.find((template) => template.tipo === "plantilla_info" && template.estado === "aprobada"),
    baja: state.templates.find((template) => template.tipo === "plantilla_baja" && template.estado === "aprobada")
  };

  if (replyKind === "positive") {
    const infoBody = templates.info ? renderTemplate(templates.info, lead, state.settings) : "";
    const campaign = state.campaigns[0];
    const asset = campaign?.assetInfoId ? state.assets.find((item) => item.id === campaign.assetInfoId) : undefined;
    return {
      state: {
        ...state,
        leads: state.leads.map((item) =>
          item.id === leadId
            ? { ...item, estado: "interesado", proximaAccion: "Contactar lead interesado", updatedAt: now }
            : item
        ),
        messages: [...state.messages, inbound],
        queue: [
          ...state.queue,
          {
            id: uid("queue"),
            leadId,
            campaignId: campaign?.id,
            phone: lead.telefono,
            messageType: "text",
            body: infoBody,
            status: "pending",
            scheduledAt: now,
            retries: 0
          },
          ...(asset
            ? [
                {
                  id: uid("queue"),
                  leadId,
                  campaignId: campaign?.id,
                  phone: lead.telefono,
                  messageType: "media" as const,
                  body: "Demo visual Connessia",
                  mediaUrl: asset.url,
                  status: "pending" as const,
                  scheduledAt: now,
                  retries: 0
                }
              ]
            : [])
        ],
        tasks: [
          ...state.tasks,
          {
            id: uid("task"),
            leadId,
            title: "Llamar o escribir a lead interesado",
            description: "Respondió afirmativamente a la campaña. Revisar necesidad y proponer demo.",
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            assignedTo: lead.comercialAsignado,
            status: "pendiente",
            priority: "alta",
            createdAt: now
          }
        ]
      },
      notice: "Respuesta positiva: lead marcado como interesado, info encolada y tarea creada."
    };
  }

  if (replyKind === "negative" || replyKind === "unsubscribe") {
    const bajaBody = templates.baja?.body ?? "Perfecto, no te molestamos más. Gracias por responder.";
    const doNotContact =
      replyKind === "unsubscribe"
        ? [
            ...state.doNotContact,
            {
              id: uid("dnc"),
              phone: lead.telefono,
              email: lead.email,
              reason: `Respuesta: ${body}`,
              source: "respuesta_whatsapp",
              createdAt: now
            }
          ]
        : state.doNotContact;

    return {
      state: {
        ...state,
        doNotContact,
        leads: state.leads.map((item) =>
          item.id === leadId
            ? {
                ...item,
                estado: replyKind === "unsubscribe" ? "baja" : "no_interesado",
                fechaBaja: replyKind === "unsubscribe" ? now : item.fechaBaja,
                motivoBaja: replyKind === "unsubscribe" ? body : item.motivoBaja,
                proximaAccion: "No contactar",
                updatedAt: now
              }
            : item
        ),
        messages: [...state.messages, inbound],
        queue: [
          ...state.queue,
          {
            id: uid("queue"),
            leadId,
            phone: lead.telefono,
            messageType: "text",
            body: bajaBody,
            status: "pending",
            scheduledAt: now,
            retries: 0
          }
        ]
      },
      notice:
        replyKind === "unsubscribe"
          ? "Solicitud de baja detectada: lead añadido a exclusión y automatización cortada."
          : "Respuesta negativa: lead marcado como no interesado y cierre encolado."
    };
  }

  return {
    state: {
      ...state,
      messages: [...state.messages, inbound],
      leads: state.leads.map((item) =>
        item.id === leadId
          ? { ...item, estado: "respuesta_ambigua", proximaAccion: "Revisión manual", updatedAt: now }
          : item
      ),
      tasks: [
        ...state.tasks,
        {
          id: uid("task"),
          leadId,
          title: "Revisar respuesta ambigua",
          description: `Respuesta recibida: "${body}"`,
          dueDate: new Date().toISOString().slice(0, 10),
          assignedTo: lead.comercialAsignado,
          status: "pendiente",
          priority: "media",
          createdAt: now
        }
      ]
    },
    notice: "Respuesta ambigua: se creó una tarea de revisión manual."
  };
}
