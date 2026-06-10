import type {
  Campaign,
  CampaignMessageStep,
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

type ResolvedCampaignStep = {
  step: number;
  templateId?: string;
  assetId?: string;
};

function campaignSteps(campaign: Campaign | undefined): ResolvedCampaignStep[] {
  if (!campaign) return [];
  return [
    { step: 2, templateId: campaign.plantillaInfoId, assetId: campaign.assetInfoId },
    ...(campaign.mensajesPostSi ?? []).map((item: CampaignMessageStep) => ({
      step: item.step,
      templateId: item.templateId,
      assetId: item.assetId
    }))
  ].filter((item) => item.step >= 2 && item.step <= 4 && (item.templateId || item.assetId));
}

function assetMessageText(asset: CommercialAsset) {
  if (asset.type === "video") return "Te paso el video demo por aqui.";
  if (asset.type === "pdf") return "Te paso el documento con la informacion por aqui.";
  return "Te paso la demo visual por aqui.";
}

function buildStepQueueItem(
  state: EngineState,
  lead: Lead,
  campaign: Campaign | undefined,
  step: ResolvedCampaignStep,
  scheduledAt: string
): QueueItem | null {
  const template = step.templateId
    ? state.templates.find((item) => item.id === step.templateId && item.estado === "aprobada")
    : undefined;
  const asset = step.assetId ? state.assets.find((item) => item.id === step.assetId) : undefined;
  const infoBody = template ? renderTemplate(template, lead, state.settings) : "";
  const assetBlock = asset ? assetMessageText(asset) : "";
  const body = [infoBody, assetBlock].filter(Boolean).join("\n\n");

  if (!body) return null;

  const alreadyPrepared = state.queue.some((item) => {
    const sameLeadCampaign = item.leadId === lead.id && item.campaignId === campaign?.id;
    const active = ["pending", "processing", "sent"].includes(item.status);
    const sameStep = item.campaignStep === step.step;
    const sameBody = item.body === body;
    return sameLeadCampaign && active && (sameStep || sameBody);
  });
  const alreadySent = state.messages.some((message) => {
    const sameLeadCampaign = message.leadId === lead.id && message.campaignId === campaign?.id;
    const sameBody = message.body === body;
    return sameLeadCampaign && message.direction === "outbound" && message.status === "sent" && sameBody;
  });

  if (alreadyPrepared || alreadySent) return null;

  return {
    id: uid("queue"),
    leadId: lead.id,
    campaignId: campaign?.id,
    phone: normalizePhone(lead.telefono),
    messageType: "text",
    templateId: template?.id,
    body,
    mediaUrl: asset?.url,
    status: "pending",
    scheduledAt,
    retries: 0,
    campaignStep: step.step
  };
}

function nextCampaignStepItem(
  state: EngineState,
  lead: Lead,
  campaign: Campaign | undefined,
  scheduledAt: string
): QueueItem | null {
  const steps = campaignSteps(campaign);
  const activeStep = state.queue.find(
    (item) =>
      item.leadId === lead.id &&
      item.campaignId === campaign?.id &&
      typeof item.campaignStep === "number" &&
      ["pending", "processing"].includes(item.status)
  );
  if (activeStep) return null;

  const sentSteps = new Set(
    state.queue
      .filter((item) => item.leadId === lead.id && item.campaignId === campaign?.id && item.status === "sent" && typeof item.campaignStep === "number")
      .map((item) => item.campaignStep as number)
  );
  const legacySecondSent = state.queue.some(
    (item) => item.leadId === lead.id && item.campaignId === campaign?.id && item.status === "sent" && item.messageType !== "template" && !item.campaignStep
  );
  if (legacySecondSent) sentSteps.add(2);

  const nextStep = steps.find((step) => !sentSteps.has(step.step));
  return nextStep ? buildStepQueueItem(state, lead, campaign, nextStep, scheduledAt) : null;
}

export function canSendToLead(lead: Lead, doNotContact: DoNotContact[]) {
  const phone = normalizePhone(lead.telefono);
  const email = lead.email.trim().toLowerCase();
  if (!lead.tieneConsentimientoWhatsapp) return "No tiene consentimiento WhatsApp registrado.";
  if (lead.contactadoCerradoAt) return "El lead ya esta terminado por comercial.";
  if (lead.contactadoResultado) return "El lead ya esta en la bandeja comercial.";
  if (["baja", "bloqueado", "no_interesado", "convertido"].includes(lead.estado)) {
    return "El lead esta cerrado, bloqueado, convertido o marcado como no interesado.";
  }
  if (!isValidInternationalPhone(phone)) return "El teléfono no tiene formato internacional válido.";
  if (
    doNotContact.some((entry) => {
      const entryEmail = entry.email?.trim().toLowerCase();
      return normalizePhone(entry.phone) === phone || Boolean(email && entryEmail && entryEmail === email);
    })
  ) {
    return "El lead está en la lista de exclusión.";
  }
  return null;
}

export function enqueuePositiveFollowup(state: EngineState, leadId: string, campaignId?: string): EngineResult {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return { state, notice: "Lead no encontrado." };
  const campaign = campaignId
    ? state.campaigns.find((item) => item.id === campaignId)
    : state.campaigns[0];
  const now = new Date().toISOString();
  const followup = nextCampaignStepItem(state, lead, campaign, now);

  if (!followup) {
    return { state, notice: "No hay mas mensajes de campaña pendientes para este lead." };
  }

  return {
    state: {
      ...state,
      leads: state.leads.map((item) =>
        item.id === leadId
          ? { ...item, estado: "interesado", proximaAccion: `Enviar mensaje ${followup.campaignStep ?? ""}`.trim(), updatedAt: now }
          : item
      ),
      queue: [...state.queue, followup]
    },
    notice: `Mensaje ${followup.campaignStep ?? ""} preparado para enviar por WhatsApp Web.`
  };
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
  const sendableLeads = selectedLeads.filter((lead) => !canSendToLead(lead, state.doNotContact));
  const alreadyHandledLeadIds = new Set([
    ...state.queue
      .filter((item) => {
        if (item.campaignId === campaign.id) {
          return ["pending", "processing", "sent"].includes(item.status);
        }
        return Boolean(campaign.excluirContactados && ["pending", "processing", "sent"].includes(item.status));
      })
      .map((item) => item.leadId),
    ...state.messages
      .filter((message) => {
        if (message.campaignId === campaign.id) {
          return message.direction === "outbound" && message.status === "sent";
        }
        return Boolean(campaign.excluirContactados && message.direction === "outbound" && message.status === "sent");
      })
      .map((message) => message.leadId)
  ]);
  const targetLeads = sendableLeads.filter((lead) => !alreadyHandledLeadIds.has(lead.id));

  if (selectedLeads.length > 0 && targetLeads.length === 0) {
    const firstReason = blockedReasons[0];
    return {
      state,
      notice: firstReason
        ? `0 mensajes preparados. ${firstReason.lead.nombreNegocio}: ${firstReason.reason}`
        : sendableLeads.length > 0
          ? "0 mensajes nuevos. Esos leads ya tienen mensaje preparado o enviado en esta campaña."
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

export function handleIncomingReply(state: EngineState, leadId: string, body: string, campaignId?: string): EngineResult {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return { state, notice: "Lead no encontrado." };

  const replyKind = classifyReply(body);
  const now = new Date().toISOString();
  const inbound: Message = {
    id: uid("msg"),
    leadId,
    campaignId,
    direction: "inbound",
    channel: "whatsapp",
    body,
    status: "received",
    createdAt: now
  };

  const campaign = campaignId
    ? state.campaigns.find((item) => item.id === campaignId)
    : state.campaigns[0];
  const templates = {
    info: campaign?.plantillaInfoId
      ? state.templates.find((template) => template.id === campaign.plantillaInfoId && template.estado === "aprobada")
      : state.templates.find((template) => template.tipo === "plantilla_info" && template.estado === "aprobada"),
    baja: state.templates.find((template) => template.tipo === "plantilla_baja" && template.estado === "aprobada")
  };

  if (replyKind === "positive") {
    const followup = nextCampaignStepItem(state, lead, campaign, now);
    return {
      state: {
        ...state,
        leads: state.leads.map((item) =>
          item.id === leadId
            ? { ...item, estado: "interesado", proximaAccion: "Contactar lead interesado", ultimoContacto: now, updatedAt: now }
            : item
        ),
        messages: [...state.messages, inbound],
        queue: followup ? [...state.queue, followup] : state.queue,
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
              phone: normalizePhone(lead.telefono),
              email: lead.email.trim() || undefined,
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
                ultimoContacto: now,
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
            campaignId: campaign?.id,
            phone: normalizePhone(lead.telefono),
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
          ? { ...item, estado: "respuesta_ambigua", proximaAccion: "Revisión manual", ultimoContacto: now, updatedAt: now }
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

export function enqueueSpecificCampaignStep(
  state: EngineState,
  leadId: string,
  stepNumber: number,
  campaignId?: string
): EngineResult {
  const lead = state.leads.find((item) => item.id === leadId);
  if (!lead) return { state, notice: "Lead no encontrado." };
  const campaign = campaignId
    ? state.campaigns.find((item) => item.id === campaignId)
    : state.campaigns[0];
  const now = new Date().toISOString();
  const blockReason = canSendToLead(lead, state.doNotContact);
  if (blockReason) {
    return { state, notice: `No se puede preparar el mensaje: ${blockReason}` };
  }

  const steps = campaignSteps(campaign);
  const targetStep = steps.find((s) => s.step === stepNumber);

  if (!targetStep) {
    return { state, notice: `Mensaje ${stepNumber} no está configurado en esta campaña.` };
  }

  const followup = buildStepQueueItem(state, lead, campaign, targetStep, now);
  if (!followup) {
    return { state, notice: `El mensaje ${stepNumber} ya está preparado o enviado.` };
  }

  return {
    state: {
      ...state,
      leads: state.leads.map((item) =>
        item.id === leadId
          ? {
              ...item,
              proximaAccion: `Enviar mensaje ${stepNumber}`,
              updatedAt: now
            }
          : item
      ),
      queue: [...state.queue, followup]
    },
    notice: `Mensaje ${stepNumber} preparado para enviar por WhatsApp Web.`
  };
}

